/** Una entrada Tab y flechas para la barra horizontal. El select nativo debe ir al final:
 * conserva todas sus teclas; Tab sale de él y al volver se entra por la primera herramienta.
 * No enfoca el editor ni modifica su selección: los comandos siguen perteneciendo a TipTap.
 */
export function rovingToolbar(node: HTMLElement): { destroy(): void } {
	let active: HTMLElement | null = null;
	const all = (): HTMLElement[] => Array.from(node.querySelectorAll('button, select'));
	const enabled = (): HTMLElement[] => all().filter((control) => !control.matches(':disabled'));

	function refresh(): void {
		const controls = enabled();
		if (!active || !controls.includes(active)) active = controls[0] ?? null;
		for (const control of all()) control.tabIndex = control === active ? 0 : -1;
	}
	function focusIn(event: FocusEvent): void {
		if (event.target instanceof HTMLElement && enabled().includes(event.target)) {
			active = event.target;
			refresh();
		}
	}
	function focusOut(event: FocusEvent): void {
		if (!(event.relatedTarget instanceof Node) || !node.contains(event.relatedTarget)) {
			active = null;
			refresh();
		}
	}
	function keydown(event: KeyboardEvent): void {
		// El select es nativo, incluyendo ←/→/Inicio/Fin y la apertura de su popup.
		if (!(event.target instanceof HTMLButtonElement)) return;
		if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
		const controls = enabled(),
			index = controls.indexOf(event.target);
		if (index < 0) return;
		let next: number;
		if (event.key === 'ArrowRight') next = (index + 1) % controls.length;
		else if (event.key === 'ArrowLeft') next = (index - 1 + controls.length) % controls.length;
		else if (event.key === 'Home') next = 0;
		else if (event.key === 'End') next = controls.length - 1;
		else return;
		event.preventDefault();
		controls[next].focus();
	}

	refresh();
	// TipTap carga después del primer paint; también puede cambiar readonly o el botón Imagen.
	const observer = new MutationObserver(refresh);
	observer.observe(node, {
		subtree: true,
		childList: true,
		attributes: true,
		attributeFilter: ['disabled']
	});
	node.addEventListener('focusin', focusIn);
	node.addEventListener('focusout', focusOut);
	node.addEventListener('keydown', keydown);
	return {
		destroy() {
			observer.disconnect();
			node.removeEventListener('focusin', focusIn);
			node.removeEventListener('focusout', focusOut);
			node.removeEventListener('keydown', keydown);
		}
	};
}
