import { afterEach, describe, expect, it, vi } from 'vitest';
import { naturalCaptureSize } from './screenshot';

/** Elemento falso: só o que naturalCaptureSize usa (rect já com o CSS zoom aplicado). */
function elemento(zoom: string, width: number, height: number): HTMLElement {
	vi.stubGlobal('getComputedStyle', () => ({ zoom }));
	return { getBoundingClientRect: () => ({ width, height }) } as unknown as HTMLElement;
}

describe('naturalCaptureSize (exportação PNG do fluxograma)', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('desfaz o CSS zoom: captura no tamanho natural, não no encolhido da tela', () => {
		// medidas reais da produção (Eng. Software, zoom inicial 0.785714)
		expect(naturalCaptureSize(elemento('0.785714', 2589.6, 961.7))).toEqual({
			width: 3296,
			height: 1224,
			zoom: 0.785714
		});
	});

	it('zoom acima de 1 também volta ao natural', () => {
		expect(naturalCaptureSize(elemento('1.5', 1500, 600))).toEqual({
			width: 1000,
			height: 400,
			zoom: 1.5
		});
	});

	it('sem zoom (ou valor inválido) usa o tamanho da tela', () => {
		expect(naturalCaptureSize(elemento('1', 800, 300))).toEqual({
			width: 800,
			height: 300,
			zoom: 1
		});
		expect(naturalCaptureSize(elemento('normal', 800, 300))).toEqual({
			width: 800,
			height: 300,
			zoom: 1
		});
		expect(naturalCaptureSize(elemento('', 800, 300)).zoom).toBe(1);
	});
});
