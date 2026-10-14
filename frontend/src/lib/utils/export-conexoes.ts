/**
 * Desenho das conexões no PNG exportado ("Com todas as conexões").
 *
 * Desenhar todas as setas (inclusive as que pulam semestres) embolava a imagem.
 * No PNG:
 *  - só as setas entre semestres vizinhos são desenhadas, cada trecho vertical
 *    em uma faixa própria no vão entre as colunas;
 *  - os cards de cada semestre são reordenados (baricentro) para cruzar menos;
 *  - pré-requisitos que pulam semestres viram texto no card ("também requer …").
 * Só afeta a imagem: a tela continua com as setas no hover.
 */

export interface Aresta {
	/** Código do pré-requisito. */
	de: string;
	/** Código da matéria que o exige. */
	para: string;
}

export interface Caixa {
	left: number;
	right: number;
	top: number;
	bottom: number;
}

export interface Rota {
	aresta: Aresta;
	/** Coluna (índice) de origem — define a cor. */
	coluna: number;
	pontos: [number, number][];
}

const norm = (c: string) => c.trim().toUpperCase();

/** Separa as arestas entre semestres vizinhos (setas) e as que pulam semestres (texto). */
export function separarArestas(
	arestas: Aresta[],
	colunaDe: Map<string, number>
): { vizinhas: Aresta[]; longas: Map<string, string[]> } {
	const vizinhas: Aresta[] = [];
	const longas = new Map<string, string[]>();
	const vistas = new Set<string>();
	for (const a of arestas) {
		const de = norm(a.de);
		const para = norm(a.para);
		const cd = colunaDe.get(de);
		const cp = colunaDe.get(para);
		const chave = `${de}>${para}`;
		if (cd === undefined || cp === undefined || cp <= cd || vistas.has(chave)) continue;
		vistas.add(chave);
		if (cp - cd === 1) vizinhas.push({ de, para });
		else longas.set(para, [...(longas.get(para) ?? []), de]);
	}
	return { vizinhas, longas };
}

/**
 * Reordena os códigos de cada coluna pela posição média dos vizinhos
 * (heurística do baricentro, varrendo para frente e para trás). Cards sem
 * vizinhos mantêm a posição relativa original.
 */
export function ordenarPorBaricentro(
	colunas: string[][],
	vizinhas: Aresta[],
	varreduras = 6
): string[][] {
	let ordem = colunas.map((c) => c.map(norm));
	const pre = new Map<string, string[]>();
	const dep = new Map<string, string[]>();
	for (const { de, para } of vizinhas) {
		pre.set(para, [...(pre.get(para) ?? []), de]);
		dep.set(de, [...(dep.get(de) ?? []), para]);
	}
	for (let v = 0; v < varreduras; v++) {
		const vizinhosDe = v % 2 === 0 ? pre : dep;
		const indice = new Map<string, number>();
		ordem.forEach((col) => col.forEach((cod, i) => indice.set(cod, i)));
		ordem = ordem.map((col) => {
			const chave = col.map((cod, i) => {
				const ns = (vizinhosDe.get(cod) ?? [])
					.map((n) => indice.get(n))
					.filter((x): x is number => x !== undefined);
				return { cod, i, k: ns.length ? ns.reduce((s, x) => s + x, 0) / ns.length : i };
			});
			chave.sort((a, b) => a.k - b.k || a.i - b.i);
			return chave.map((c) => c.cod);
		});
	}
	return ordem;
}

/** Cruzamentos entre arestas de vizinhos para uma ordem (métrica usada nos testes). */
export function contarCruzamentos(colunas: string[][], vizinhas: Aresta[]): number {
	const pos = new Map<string, [number, number]>();
	colunas.forEach((col, ci) => col.forEach((cod, ri) => pos.set(norm(cod), [ci, ri])));
	const as = vizinhas.map((a) => [pos.get(a.de), pos.get(a.para)]).filter(([x, y]) => x && y) as [
		[number, number],
		[number, number]
	][];
	let n = 0;
	for (let i = 0; i < as.length; i++)
		for (let j = i + 1; j < as.length; j++) {
			if (as[i][0][0] !== as[j][0][0]) continue;
			if ((as[i][0][1] - as[j][0][1]) * (as[i][1][1] - as[j][1][1]) < 0) n++;
		}
	return n;
}

/**
 * Rotas ortogonais das setas entre vizinhos: sai do meio da borda direita da
 * origem, desce/sobe numa faixa própria do vão e entra pela borda esquerda do
 * destino. Trechos verticais que se sobrepõem no mesmo vão ganham faixas
 * diferentes (coloração de intervalos).
 */
export function rotearVizinhas(
	caixas: Map<string, Caixa>,
	vizinhas: Aresta[],
	colunaDe: Map<string, number>,
	folga = 6
): Rota[] {
	type Seg = {
		aresta: Aresta;
		coluna: number;
		ys: number;
		yt: number;
		xs: number;
		xt: number;
		faixa?: number;
	};
	const porVao = new Map<number, Seg[]>();
	for (const a of vizinhas) {
		const s = caixas.get(a.de);
		const t = caixas.get(a.para);
		const coluna = colunaDe.get(a.de);
		if (!s || !t || coluna === undefined) continue;
		const seg: Seg = {
			aresta: a,
			coluna,
			ys: (s.top + s.bottom) / 2,
			yt: (t.top + t.bottom) / 2,
			xs: s.right,
			xt: t.left
		};
		porVao.set(coluna, [...(porVao.get(coluna) ?? []), seg]);
	}
	const rotas: Rota[] = [];
	for (const segs of porVao.values()) {
		segs.sort((a, b) => Math.min(a.ys, a.yt) - Math.min(b.ys, b.yt) || a.ys - b.ys);
		const fimDaFaixa: number[] = [];
		for (const s of segs) {
			const lo = Math.min(s.ys, s.yt) - folga;
			const hi = Math.max(s.ys, s.yt) + folga;
			let f = fimDaFaixa.findIndex((fim) => fim < lo);
			if (f === -1) {
				f = fimDaFaixa.length;
				fimDaFaixa.push(hi);
			} else fimDaFaixa[f] = hi;
			s.faixa = f;
		}
		const n = fimDaFaixa.length;
		const x0 = Math.max(...segs.map((s) => s.xs));
		const x1 = Math.min(...segs.map((s) => s.xt));
		for (const s of segs) {
			const x = x0 + ((x1 - x0) * (s.faixa! + 1)) / (n + 1);
			const pontos: [number, number][] =
				Math.abs(s.ys - s.yt) < 1
					? [
							[s.xs, s.ys],
							[s.xt, s.yt]
						]
					: [
							[s.xs, s.ys],
							[x, s.ys],
							[x, s.yt],
							[s.xt, s.yt]
						];
			rotas.push({ aresta: s.aresta, coluna: s.coluna, pontos });
		}
	}
	return rotas;
}

/** Caminho SVG de uma polilinha ortogonal com cantos arredondados. */
export function caminhoArredondado(pontos: [number, number][], raio = 8): string {
	if (pontos.length === 0) return '';
	const f = (n: number) => Math.round(n * 10) / 10;
	let d = `M${f(pontos[0][0])},${f(pontos[0][1])}`;
	for (let i = 1; i < pontos.length - 1; i++) {
		const [px, py] = pontos[i - 1];
		const [x, y] = pontos[i];
		const [nx, ny] = pontos[i + 1];
		const r = Math.min(raio, Math.hypot(x - px, y - py) / 2, Math.hypot(nx - x, ny - y) / 2);
		const ax = x - Math.sign(x - px) * r;
		const ay = y - Math.sign(y - py) * r;
		const bx = x + Math.sign(nx - x) * r;
		const by = y + Math.sign(ny - y) * r;
		d += ` L${f(ax)},${f(ay)} Q${f(x)},${f(y)} ${f(bx)},${f(by)}`;
	}
	const [lx, ly] = pontos[pontos.length - 1];
	return `${d} L${f(lx)},${f(ly)}`;
}

export interface Trilha {
	/** Matéria-raiz da trilha (sem pré-requisito dentro do curso). */
	raiz: string;
	/** Semestres de distância até a raiz (0 na própria raiz). */
	profundidade: number;
}

/**
 * Trilha de cada matéria: a raiz (matéria sem pré-requisito) de onde a cadeia
 * dela parte. Quem depende de mais de uma raiz fica com a mais antiga (menor
 * coluna; empate pelo código). A cor da seta vem da trilha da origem, então
 * cada cadeia (Cálculo, Algoritmos, Discreta…) aparece numa cor só.
 */
export function calcularTrilhas(
	arestas: Aresta[],
	colunaDe: Map<string, number>
): Map<string, Trilha> {
	const pre = new Map<string, string[]>();
	const nos = new Set<string>();
	for (const a of arestas) {
		const de = norm(a.de);
		const para = norm(a.para);
		if (!colunaDe.has(de) || !colunaDe.has(para) || colunaDe.get(para)! <= colunaDe.get(de)!)
			continue;
		nos.add(de);
		nos.add(para);
		pre.set(para, [...(pre.get(para) ?? []), de]);
	}
	const memo = new Map<string, string>();
	const raizDe = (n: string): string => {
		const salvo = memo.get(n);
		if (salvo) return salvo;
		const ps = pre.get(n) ?? [];
		const raizes = ps.length ? ps.map(raizDe) : [n];
		raizes.sort((a, b) => colunaDe.get(a)! - colunaDe.get(b)! || a.localeCompare(b));
		memo.set(n, raizes[0]);
		return raizes[0];
	};
	const trilhas = new Map<string, Trilha>();
	for (const n of nos) {
		const raiz = raizDe(n);
		trilhas.set(n, { raiz, profundidade: colunaDe.get(n)! - colunaDe.get(raiz)! });
	}
	return trilhas;
}
