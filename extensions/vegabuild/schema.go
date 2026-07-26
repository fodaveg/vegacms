package vegabuild

import (
	"fmt"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/dbutils"
)

// EnsureCollections idempotently creates Config.RunsCollection if it does not exist yet, and
// validates it against this extension's contract otherwise: a base collection with every API rule
// locked (nil), so the only way to read a run's state is through GET /status, never a direct
// PocketBase list/view call. A pre-existing collection with that name that does NOT meet this
// contract is a hard error, never silently reused — reusing it in silence could turn what looks
// like a private support collection into one some other part of the project already exposes
// publicly.
//
// The validation helpers below (validatePrivateCollection, requireText, ...) intentionally mirror
// extensions/vegaauth/schema.go rather than importing it: vegaauth and vegabuild are separate Go
// modules (see the go.mod of each), so there is no shared internal package to import from without
// introducing a third module just for this; duplicating a few dozen lines is cheaper than that.
func (x *Extension) EnsureCollections(app core.App) error {
	indexName := "idx_" + x.config.RunsCollection + "_created"

	collection, err := findOrCreate(app, x.config.RunsCollection, func(collection *core.Collection) {
		collection.Fields.Add(
			&core.TextField{Name: "state", Required: true},
			&core.TextField{Name: "startedAt", Required: true},
			&core.TextField{Name: "finishedAt"},
			// logUrl/externalRef/detail are capped: POST /callback lets an external CI system set
			// logUrl and detail (see closeRun's truncate calls, which enforce the same caps before
			// ever reaching Save so an oversized value is quietly capped instead of failing the
			// whole callback), and a Runner's Handoff can set externalRef/logUrl too (applyHandoff
			// truncates those the same way). Nothing about who is allowed to call these routes
			// limits how large a value they can send.
			&core.TextField{Name: "logUrl", Max: maxLogURLLength},
			&core.TextField{Name: "externalRef", Max: maxExternalRefLength},
			&core.TextField{Name: "detail", Max: maxDetailLength},
			&core.AutodateField{Name: "created", OnCreate: true},
		)
		collection.AddIndex(indexName, false, "created", "")
	})
	if err != nil {
		return err
	}
	if err := validatePrivateCollection(collection); err != nil {
		return err
	}
	if err := requireText(collection, "state", true, 0); err != nil {
		return err
	}
	if err := requireText(collection, "startedAt", true, 0); err != nil {
		return err
	}
	if err := requireText(collection, "finishedAt", false, 0); err != nil {
		return err
	}
	if err := requireText(collection, "logUrl", false, maxLogURLLength); err != nil {
		return err
	}
	if err := requireText(collection, "externalRef", false, maxExternalRefLength); err != nil {
		return err
	}
	if err := requireText(collection, "detail", false, maxDetailLength); err != nil {
		return err
	}
	if err := requireAutodate(collection, "created"); err != nil {
		return err
	}
	if err := requireIndex(collection, indexName, false, "created"); err != nil {
		return err
	}
	return nil
}

func findOrCreate(app core.App, name string, configure func(*core.Collection)) (*core.Collection, error) {
	collection, err := app.FindCollectionByNameOrId(name)
	if err == nil {
		return collection, nil
	}
	collection = core.NewBaseCollection(name)
	configure(collection)
	if err := app.Save(collection); err != nil {
		return nil, err
	}
	return collection, nil
}

// validatePrivateCollection rejects anything but a plain base collection with every API rule
// locked. Same criterion as vegaauth's collections: the state served by GET /status is the only
// sanctioned read path.
func validatePrivateCollection(collection *core.Collection) error {
	if collection.Type != core.CollectionTypeBase {
		return fmt.Errorf("vegabuild: reserved collection %s must be a base collection", collection.Name)
	}
	if collection.ListRule != nil || collection.ViewRule != nil || collection.CreateRule != nil ||
		collection.UpdateRule != nil || collection.DeleteRule != nil {
		return fmt.Errorf("vegabuild: reserved collection %s must keep all API rules locked", collection.Name)
	}
	return nil
}

func requireText(collection *core.Collection, name string, required bool, max int) error {
	field, ok := collection.Fields.GetByName(name).(*core.TextField)
	if !ok || field.Required != required || (max > 0 && field.Max != max) {
		return fmt.Errorf("vegabuild: incompatible text field %s.%s", collection.Name, name)
	}
	return nil
}

func requireAutodate(collection *core.Collection, name string) error {
	field, ok := collection.Fields.GetByName(name).(*core.AutodateField)
	if !ok || !field.OnCreate {
		return fmt.Errorf("vegabuild: incompatible autodate field %s.%s", collection.Name, name)
	}
	return nil
}

func requireIndex(collection *core.Collection, name string, unique bool, columns ...string) error {
	index := dbutils.ParseIndex(collection.GetIndex(name))
	if !index.IsValid() || index.IndexName != name || index.TableName != collection.Name ||
		index.Unique != unique || index.Where != "" || len(index.Columns) != len(columns) {
		return fmt.Errorf("vegabuild: incompatible index %s.%s", collection.Name, name)
	}
	for i, column := range columns {
		if index.Columns[i].Name != column || index.Columns[i].Collate != "" || index.Columns[i].Sort != "" {
			return fmt.Errorf("vegabuild: incompatible index %s.%s", collection.Name, name)
		}
	}
	return nil
}
