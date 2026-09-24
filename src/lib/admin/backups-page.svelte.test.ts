/**
 * `/copias` montada con un puerto de mentira: la puerta de superusuario, el aviso de copia en
 * marcha (`'busy'`) y la descarga con URL autorizada. El recorrido completo contra el adaptador
 * `memory` está en `e2e/superuser.spec.ts`.
 */
import { mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import type { AdministrationPort, BackendPort, BackupFile } from '$lib/backend';
import BackupsPage from '../../routes/copias/+page.svelte';

const BACKUP: BackupFile = {
	key: 'pb_backup_vega_20260924101530.zip',
	size: 48_300_000,
	modified: '2026-09-24T10:15:30.000Z'
};

function fakeAdministration(overrides: Partial<AdministrationPort> = {}): AdministrationPort {
	return {
		listEditors: vi.fn(),
		mailEnabled: vi.fn(),
		createEditor: vi.fn(),
		setEditorPassword: vi.fn(),
		sendEditorInvitation: vi.fn(),
		removeEditor: vi.fn(),
		listBackups: vi.fn(async () => [BACKUP]),
		createBackup: vi.fn(async () => 'created' as const),
		backupDownloadUrl: vi.fn(async (key: string) => `https://pb.test/api/backups/${key}?token=t`),
		...overrides
	};
}

function mountPage(admin: AdministrationPort | undefined) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const ctx = {
		t: (key: string, params?: Record<string, string | number>) =>
			params ? `${key}:${JSON.stringify(params)}` : key,
		locale: 'es',
		port: {
			capabilities: { administration: admin !== undefined },
			administration: admin
		} as unknown as BackendPort,
		feedback: { toast: vi.fn(), reportError: vi.fn() }
	} as unknown as VegaAppContext;
	const instance = mount(BackupsPage, { target, context: new Map([[VEGA_CONTEXT_KEY, ctx]]) });
	return { target, instance, ctx };
}

async function settle(): Promise<void> {
	for (let i = 0; i < 4; i++) await Promise.resolve();
	await tick();
}

function button(target: HTMLElement, text: string): HTMLButtonElement {
	const found = Array.from(target.querySelectorAll('button')).find((b) =>
		b.textContent?.includes(text)
	);
	if (!found) throw new Error(`No hay botón con «${text}»`);
	return found;
}

describe('/copias', () => {
	let mounted: ReturnType<typeof mountPage> | null = null;

	afterEach(async () => {
		if (mounted) {
			await unmount(mounted.instance);
			mounted.target.remove();
			mounted = null;
		}
		vi.restoreAllMocks();
	});

	test('sin la capability: solo la tarjeta de superusuarios, sin pedir nada al puerto', async () => {
		mounted = mountPage(undefined);
		await settle();
		expect(mounted.target.querySelector('[data-admin-state="gated"]')).not.toBeNull();
		expect(mounted.target.textContent).toContain('admin.backups.gateBody');
		expect(mounted.target.querySelector('table')).toBeNull();
	});

	test('otra copia en marcha: aviso con el motivo encima de la lista, que sigue visible', async () => {
		const admin = fakeAdministration({ createBackup: vi.fn(async () => 'busy' as const) });
		mounted = mountPage(admin);
		await settle();

		button(mounted.target, 'admin.backups.create').click();
		await settle();

		const notice = mounted.target.querySelector('[data-backups-error="busy"]');
		expect(notice?.textContent).toContain('admin.backups.busy');
		expect(mounted.target.querySelector(`[data-backup-key="${BACKUP.key}"]`)).not.toBeNull();
		expect(mounted.ctx.feedback.toast).not.toHaveBeenCalled();
	});

	test('descargar pide la URL autorizada y la abre como descarga con el nombre de la copia', async () => {
		const admin = fakeAdministration();
		const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
		mounted = mountPage(admin);
		await settle();

		button(mounted.target, 'admin.backups.download').click();
		await settle();

		expect(admin.backupDownloadUrl).toHaveBeenCalledWith(BACKUP.key);
		expect(click).toHaveBeenCalledTimes(1);
		const anchor = click.mock.contexts[0] as HTMLAnchorElement;
		expect(anchor.href).toBe(`https://pb.test/api/backups/${BACKUP.key}?token=t`);
		expect(anchor.download).toBe(BACKUP.key);
	});
});
