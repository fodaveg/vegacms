package vegabuild

import (
	"context"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// defaultCommandTimeout is how long a build is allowed to run before CommandRunner kills it.
const defaultCommandTimeout = 15 * time.Minute

// defaultMaxLogBytes caps a single run's log file: a build stuck in a noisy loop must not fill the
// disk just because nobody set an explicit limit.
const defaultMaxLogBytes = 5 * 1024 * 1024 // 5 MiB

// CommandConfig configures a CommandRunner: Opción A of the integration doc, for a self-hosted
// deployment where PocketBase and the static site build run on the same machine.
type CommandConfig struct {
	// Command is the executable to run. It is fixed by the operator at startup — it NEVER comes
	// from an HTTP request, and nothing about a /trigger call is interpolated into it or its Args:
	// there is no per-request input to this Runner at all, which is exactly the point.
	Command string
	Args    []string
	// Dir is the working directory the command runs in; empty means the process's own.
	Dir string
	// Env is the exact environment the command receives. nil means "inherit os.Environ()"; a
	// non-nil (even empty) slice means exactly that environment and nothing else.
	Env []string
	// Timeout bounds how long a single run may take before it is killed and reported failed.
	// Default 15 minutes.
	Timeout time.Duration
	// LogDir is required: every run writes its combined stdout+stderr to "<runID>.log" in it.
	LogDir string
	// LogURLTemplate optionally turns a run id into a browsable URL for the recorded run, e.g.
	// "https://example.com/build-logs/{id}.log". "{id}" is replaced with the run id; empty means
	// no logUrl is recorded.
	LogURLTemplate string
	// MaxLogBytes caps a single run's log file; default 5 MiB. The log is truncated, not left to
	// grow without bound.
	MaxLogBytes int64
}

func (c CommandConfig) normalized() (CommandConfig, error) {
	c.Command = strings.TrimSpace(c.Command)
	if c.Command == "" {
		return c, fmt.Errorf("vegabuild: CommandConfig.Command is required")
	}
	c.LogDir = strings.TrimSpace(c.LogDir)
	if c.LogDir == "" {
		return c, fmt.Errorf("vegabuild: CommandConfig.LogDir is required")
	}
	if c.Timeout <= 0 {
		c.Timeout = defaultCommandTimeout
	}
	if c.MaxLogBytes <= 0 {
		c.MaxLogBytes = defaultMaxLogBytes
	}
	return c, nil
}

// CommandRunner triggers a build by running a local command (`exec.CommandContext`). It Completes
// its own runs: Start spawns the command and returns immediately, and a background goroutine calls
// report with the real outcome (exit code, or timeout) once the process is done.
type CommandRunner struct {
	config CommandConfig
}

// NewCommandRunner validates config, creates LogDir if missing, and returns a ready CommandRunner.
func NewCommandRunner(config CommandConfig) (*CommandRunner, error) {
	config, err := config.normalized()
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(config.LogDir, 0o755); err != nil {
		return nil, fmt.Errorf("vegabuild: create LogDir: %w", err)
	}
	return &CommandRunner{config: config}, nil
}

// Completes always returns true: CommandRunner owns the whole lifecycle of a run.
func (r *CommandRunner) Completes() bool { return true }

// Start runs the configured command as a child process. Nothing from the HTTP request that
// reached /trigger reaches the command: runID only names the log file, it is never passed as an
// argument or environment variable.
func (r *CommandRunner) Start(_ context.Context, runID string, report func(Result)) (Handoff, error) {
	logPath := filepath.Join(r.config.LogDir, runID+".log")
	logFile, err := os.Create(logPath)
	if err != nil {
		return Handoff{}, fmt.Errorf("vegabuild: create log file: %w", err)
	}

	// Deliberately NOT derived from the request context: the request handler returns long before
	// the command does, and the process must keep running (bounded only by its own Timeout).
	runCtx, cancel := context.WithTimeout(context.Background(), r.config.Timeout)

	env := r.config.Env
	if env == nil {
		env = os.Environ()
	}

	cmd := exec.CommandContext(runCtx, r.config.Command, r.config.Args...)
	cmd.Dir = r.config.Dir
	cmd.Env = env
	writer := newCappedWriter(logFile, r.config.MaxLogBytes)
	cmd.Stdout = writer
	cmd.Stderr = writer

	if err := cmd.Start(); err != nil {
		cancel()
		_ = logFile.Close()
		return Handoff{}, fmt.Errorf("vegabuild: start command: %w", err)
	}

	logURL := r.logURL(runID)

	go func() {
		defer cancel()
		defer func() { _ = logFile.Close() }()

		// report is called at most once per run (see the Runner contract): a bare panic in this
		// goroutine, left unrecovered, would crash the ENTIRE PocketBase process and abandon every
		// other run in flight along with it, not just this one. recover() here, plus reporting the
		// run itself as failed, keeps a single misbehaving build from taking the whole server down.
		reported := false
		safeReport := func(result Result) {
			if reported {
				return
			}
			reported = true
			report(result)
		}
		defer func() {
			if r := recover(); r != nil {
				log.Printf("vegabuild: CommandRunner panicked while waiting for run %q: %v", runID, r)
				safeReport(Result{Detail: fmt.Sprintf("build runner panicked: %v", r)})
			}
		}()

		waitErr := cmd.Wait()
		result := Result{LogURL: logURL}
		switch {
		case waitErr == nil:
			result.OK = true
		case runCtx.Err() == context.DeadlineExceeded:
			result.Detail = fmt.Sprintf("build killed after exceeding its %s timeout", r.config.Timeout)
		default:
			result.Detail = waitErr.Error()
		}
		safeReport(result)
	}()

	return Handoff{LogURL: logURL}, nil
}

func (r *CommandRunner) logURL(runID string) string {
	if r.config.LogURLTemplate == "" {
		return ""
	}
	return strings.ReplaceAll(r.config.LogURLTemplate, "{id}", runID)
}

// cappedWriter forwards writes to an underlying io.Writer up to a fixed byte budget, then silently
// drops the rest. It always reports having consumed the whole input it was given (even once
// capped): os/exec copies a command's stdout/stderr through this writer with io.Copy, and an
// io.Writer that reports fewer bytes written than it was given, without an error, is itself an
// error condition (io.ErrShortWrite) that would abort the copy — the goal here is not to signal a
// problem, just to stop growing the file, so we absorb the extra bytes instead of rejecting them.
type cappedWriter struct {
	mu        sync.Mutex
	w         io.Writer
	max       int64
	written   int64
	truncated bool
}

func newCappedWriter(w io.Writer, max int64) *cappedWriter {
	return &cappedWriter{w: w, max: max}
}

func (c *cappedWriter) Write(p []byte) (int, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	total := len(p)
	if c.written >= c.max {
		if !c.truncated {
			c.truncated = true
			_, _ = c.w.Write([]byte("\n... (log truncated) ...\n"))
		}
		return total, nil
	}

	remaining := c.max - c.written
	chunk := p
	if int64(len(chunk)) > remaining {
		chunk = chunk[:remaining]
	}
	n, err := c.w.Write(chunk)
	c.written += int64(n)
	if err != nil {
		return n, err
	}
	return total, nil
}
