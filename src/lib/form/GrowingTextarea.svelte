<script lang="ts">
	/**
	 * `GrowingTextarea.svelte` (lote 12, láminas 4 y 5): un `<textarea rows="1">` que crece hacia
	 * abajo con su texto, sin tirador de cambio de tamaño ni barra de desplazamiento. Es el control
	 * del título del registro (`Text.svelte` cuando el campo es `titleField`) y lo reutilizará el
	 * texto alternativo de una imagen subida desde un campo.
	 *
	 * **Cómo crece**: `field-sizing: content` donde el navegador lo soporta (Chromium); donde no, el
	 * alto se calcula al escribir (`scrollHeight`) y al cambiar el ancho (`ResizeObserver`, porque
	 * un cambio de ancho cambia las líneas de ajuste). Con `field-sizing` soportado no se ejecuta
	 * nada de JS de medida.
	 *
	 * **Una línea lógica (`singleLine`)**: un título no lleva saltos de línea; las líneas que se ven
	 * son solo de ajuste. Intro no inserta un salto: llama a `onEnter` (en `Text.svelte`, el envío
	 * del formulario, que es lo que hacía Intro en el `<input>` de antes) y un texto pegado con
	 * saltos se guarda con espacios en su lugar (misma longitud: el cursor no se mueve). Sin
	 * `singleLine` es un textarea normal que solo crece.
	 *
	 * **Qué NO hace**: no pinta caja, color ni tipografía. Lo pone quien lo usa con su `class`
	 * (`.vega-widget-text` en el título); aquí solo viven las propiedades de crecimiento. Todo
	 * atributo que no sea de esta lista (`id`, `aria-*`, `placeholder`, `maxlength`, `disabled`…)
	 * pasa tal cual al `<textarea>`.
	 */
	import { onMount } from 'svelte';
	import type { HTMLTextareaAttributes } from 'svelte/elements';

	interface Props extends Omit<HTMLTextareaAttributes, 'value' | 'oninput' | 'onkeydown' | 'rows'> {
		/** Texto actual (controlado: quien lo usa es la fuente de verdad). */
		value: string;
		/** Se llama en cada cambio con el texto ya saneado (sin saltos si `singleLine`). */
		onChange: (value: string) => void;
		/** Un solo párrafo: Intro no parte línea y los saltos pegados pasan a espacios. Default `false`. */
		singleLine?: boolean;
		/** Intro con `singleLine` (el salto NO se inserta). Sin él, Intro no hace nada. */
		onEnter?: (event: KeyboardEvent) => void;
		/** Clase(s) de la caja (borde, fondo, tipografía), de quien lo usa. */
		class?: string;
	}

	let { value, onChange, singleLine = false, onEnter, class: className, ...rest }: Props = $props();

	let el: HTMLTextAreaElement | undefined = $state();

	/** `field-sizing` lo hace el navegador; si no, hay que medir a mano. */
	const nativeSizing =
		typeof CSS !== 'undefined' && typeof CSS.supports === 'function'
			? CSS.supports('field-sizing', 'content')
			: false;

	/** Ajusta el alto al contenido donde no hay `field-sizing`. `border-box`: suma los bordes. */
	function fit(): void {
		if (nativeSizing || !el) return;
		el.style.height = 'auto';
		el.style.height = `${el.scrollHeight + (el.offsetHeight - el.clientHeight)}px`;
	}

	function handleInput(event: Event): void {
		const target = event.currentTarget as HTMLTextAreaElement;
		if (singleLine && /[\r\n]/.test(target.value)) {
			const start = target.selectionStart;
			const end = target.selectionEnd;
			// Un salto (`\n`; el DOM ya normaliza `\r\n`) por un espacio: mismo largo, cursor intacto.
			target.value = target.value.replace(/\r\n|[\r\n]/g, ' ');
			target.setSelectionRange(start, end);
		}
		onChange(target.value);
		fit();
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (!singleLine || event.key !== 'Enter') return;
		// Intro con un IME abierto confirma la composición: no es un Intro del usuario. WebKit lo
		// entrega ya con `isComposing === false` y `keyCode === 229`.
		if (event.isComposing || event.keyCode === 229) return;
		event.preventDefault();
		onEnter?.(event);
	}

	// Cambia el valor desde fuera (cargar, descartar, revertir): volver a medir.
	$effect(() => {
		void value;
		fit();
	});

	onMount(() => {
		fit();
		if (nativeSizing || !el || typeof ResizeObserver === 'undefined') return;
		// Solo el ANCHO cambia las líneas de ajuste; reaccionar al alto sería un bucle con `fit`.
		let lastWidth = el.clientWidth;
		const observer = new ResizeObserver(() => {
			if (!el || el.clientWidth === lastWidth) return;
			lastWidth = el.clientWidth;
			fit();
		});
		observer.observe(el);
		return () => observer.disconnect();
	});
</script>

<textarea
	{...rest}
	bind:this={el}
	class={['vega-growing-textarea', className]}
	rows="1"
	{value}
	oninput={handleInput}
	onkeydown={handleKeydown}></textarea>

<style>
	/* Las cuatro propiedades de la lámina 4 + el interlineado: 1,25 para que dos líneas de un título
	   grande no queden separadas como un párrafo. `.vega-growing-textarea` (y no `textarea` a secas)
	   para ganar al `font: inherit` de la caja de quien lo usa, que reinicia `line-height`. */
	.vega-growing-textarea {
		resize: none;
		overflow: hidden;
		line-height: 1.25;
		field-sizing: content;
		/* Una palabra sin espacios (una URL) parte por cualquier carácter: nunca ensancha el formulario. */
		overflow-wrap: anywhere;
	}
</style>
