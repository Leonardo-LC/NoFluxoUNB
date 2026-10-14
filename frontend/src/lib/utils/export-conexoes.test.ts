import { describe, expect, it } from 'vitest';
import {
	calcularTrilhas,
	caminhoArredondado,
	contarCruzamentos,
	ordenarPorBaricentro,
	rotearVizinhas,
	separarArestas,
	type Caixa
} from './export-conexoes';

const colunaDe = (colunas: string[][]) =>
	new Map(colunas.flatMap((col, ci) => col.map((c) => [c, ci] as [string, number])));

describe('separarArestas', () => {
	const cols = [['A', 'B'], ['C'], ['D'], ['E']];

	it('vizinhas viram seta; as que pulam semestre viram texto no destino', () => {
		const { vizinhas, longas } = separarArestas(
			[
				{ de: 'A', para: 'C' },
				{ de: 'C', para: 'D' },
				{ de: 'A', para: 'D' },
				{ de: 'B', para: 'E' }
			],
			colunaDe(cols)
		);
		expect(vizinhas).toEqual([
			{ de: 'A', para: 'C' },
			{ de: 'C', para: 'D' }
		]);
		expect(longas).toEqual(
			new Map([
				['D', ['A']],
				['E', ['B']]
			])
		);
	});

	it('ignora duplicata, código fora da tela e aresta para trás; normaliza o código', () => {
		const { vizinhas, longas } = separarArestas(
			[
				{ de: ' a ', para: 'c' },
				{ de: 'A', para: 'C' },
				{ de: 'X', para: 'C' },
				{ de: 'D', para: 'C' }
			],
			colunaDe(cols)
		);
		expect(vizinhas).toEqual([{ de: 'A', para: 'C' }]);
		expect(longas.size).toBe(0);
	});
});

describe('ordenarPorBaricentro', () => {
	it('desfaz cruzamentos quando possível', () => {
		const cols = [
			['A', 'B'],
			['C', 'D']
		];
		const arestas = [
			{ de: 'A', para: 'D' },
			{ de: 'B', para: 'C' }
		];
		expect(contarCruzamentos(cols, arestas)).toBe(1);
		const nova = ordenarPorBaricentro(cols, arestas);
		expect(contarCruzamentos(nova, arestas)).toBe(0);
	});

	it('mantém todos os cards e a ordem de quem não tem conexão', () => {
		const cols = [
			['A', 'B', 'C'],
			['D', 'E', 'F']
		];
		const nova = ordenarPorBaricentro(cols, []);
		expect(nova).toEqual(cols);
		const comUma = ordenarPorBaricentro(cols, [{ de: 'C', para: 'D' }]);
		expect(comUma.map((c) => [...c].sort())).toEqual(cols);
	});
});

describe('rotearVizinhas', () => {
	const caixa = (col: number, linha: number): Caixa => ({
		left: col * 300,
		right: col * 300 + 200,
		top: linha * 100,
		bottom: linha * 100 + 60
	});

	it('sai pela direita da origem e entra pela esquerda do destino, dentro do vão', () => {
		const caixas = new Map([
			['A', caixa(0, 0)],
			['B', caixa(1, 2)]
		]);
		const [r] = rotearVizinhas(
			caixas,
			[{ de: 'A', para: 'B' }],
			new Map([
				['A', 0],
				['B', 1]
			])
		);
		expect(r.pontos[0]).toEqual([200, 30]);
		expect(r.pontos.at(-1)).toEqual([300, 230]);
		const x = r.pontos[1][0];
		expect(x).toBeGreaterThan(200);
		expect(x).toBeLessThan(300);
	});

	it('trechos verticais que se sobrepõem no mesmo vão ficam em faixas diferentes', () => {
		const caixas = new Map([
			['A', caixa(0, 0)],
			['B', caixa(0, 1)],
			['C', caixa(1, 3)],
			['D', caixa(1, 4)]
		]);
		const cols = new Map([
			['A', 0],
			['B', 0],
			['C', 1],
			['D', 1]
		]);
		const rotas = rotearVizinhas(
			caixas,
			[
				{ de: 'A', para: 'C' },
				{ de: 'B', para: 'D' }
			],
			cols
		);
		const xs = rotas.map((r) => r.pontos[1][0]);
		expect(new Set(xs).size).toBe(2);
	});

	it('mesma altura: linha reta', () => {
		const caixas = new Map([
			['A', caixa(0, 1)],
			['B', caixa(1, 1)]
		]);
		const [r] = rotearVizinhas(
			caixas,
			[{ de: 'A', para: 'B' }],
			new Map([
				['A', 0],
				['B', 1]
			])
		);
		expect(r.pontos).toEqual([
			[200, 130],
			[300, 130]
		]);
	});
});

describe('caminhoArredondado', () => {
	it('arredonda os cantos com curva e termina no último ponto', () => {
		const d = caminhoArredondado([
			[0, 0],
			[50, 0],
			[50, 100],
			[100, 100]
		]);
		expect(d.startsWith('M0,0')).toBe(true);
		expect(d).toContain('Q50,0');
		expect(d).toContain('Q50,100');
		expect(d.endsWith('L100,100')).toBe(true);
	});
});

describe('calcularTrilhas', () => {
	const cols = new Map([
		['CALC1', 0],
		['ALG', 0],
		['CALC2', 1],
		['ED1', 1],
		['MN', 2],
		['ED2', 2]
	]);

	it('cada matéria herda a raiz da cadeia e a distância até ela', () => {
		const t = calcularTrilhas(
			[
				{ de: 'CALC1', para: 'CALC2' },
				{ de: 'CALC2', para: 'MN' },
				{ de: 'ALG', para: 'ED1' },
				{ de: 'ED1', para: 'ED2' }
			],
			cols
		);
		expect(t.get('MN')).toEqual({ raiz: 'CALC1', profundidade: 2 });
		expect(t.get('ED2')).toEqual({ raiz: 'ALG', profundidade: 2 });
		expect(t.get('ALG')).toEqual({ raiz: 'ALG', profundidade: 0 });
	});

	it('quem depende de duas trilhas fica com a raiz mais antiga (empate pelo código)', () => {
		const t = calcularTrilhas(
			[
				{ de: 'CALC1', para: 'MN' },
				{ de: 'ALG', para: 'MN' }
			],
			cols
		);
		expect(t.get('MN')?.raiz).toBe('ALG');
	});
});
