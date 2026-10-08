import type { VegaAppContext } from '$lib/app-context';

type Context = Pick<VegaAppContext, 'port' | 'session'>;

/** Interaction-only imports belong to one backend, authenticated person and editor record.
 * Logout can expose a null session before the editor unmounts. */
export function captureEditorIdentity(ctx: Context, type: string, id: string | null) {
	const session = ctx.session;
	return session ? { port: ctx.port, token: session.token, user: session.user.id, type, id } : null;
}

/** Recheck the same boundary after await; it never revives an intent from an earlier context. */
export function currentEditorIdentity(
	ctx: Context,
	identity: NonNullable<ReturnType<typeof captureEditorIdentity>>,
	type: string,
	id: string | null
): boolean {
	const current = captureEditorIdentity(ctx, type, id);
	return (
		current !== null &&
		identity.port === current.port &&
		identity.token === current.token &&
		identity.user === current.user &&
		identity.type === current.type &&
		identity.id === current.id
	);
}
