/**
 * Monta, fora da tela, a cópia do fluxograma usada no PNG "Com todas as conexões":
 * cards reordenados, setas só entre semestres vizinhos e "também requer …" nos
 * cards cujo pré-requisito pula semestres. A tela do usuário não é tocada.
 *
 * A cópia é feita antes da captura (e não no `onclone` do html2canvas) porque o
 * texto extra muda a altura: o tamanho da imagem precisa ser medido depois.
 */
import {
	calcularTrilhas,
	caminhoArredondado,
	ordenarPorBaricentro,
	rotearVizinhas,
	separarArestas,
	type Aresta,
	type Caixa
} from './export-conexoes';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Vão entre colunas na imagem: espaço para as faixas das setas. */
const VAO_COLUNAS_PX = 96;
/** Matizes das trilhas (uma por cadeia), em ordem de raiz mais antiga. */
const MATIZES = [217, 330, 160, 38, 265, 0, 190, 90, 20, 295];

/**
 * Cor de uma trilha numa profundidade: mais clara perto da raiz e mais intensa
 * nos semestres seguintes, para o caminho ler como um gradiente da cadeia.
 */
function corDaTrilha(indice: number, profundidade: number, escuro: boolean): string {
	const h = MATIZES[indice % MATIZES.length];
	const p = Math.min(profundidade, 6) / 6;
	const s = Math.round(55 + 35 * p);
	const l = Math.round(escuro ? 80 - 22 * p : 60 - 22 * p);
	return `hsl(${h} ${s}% ${l}%)`;
}

/** Nome da matéria a partir do texto do card (linha mais longa que não é código nem créditos). */
function nomeDoCard(card: HTMLElement, cod: string): string {
	const linhas = (card.innerText || card.textContent || '')
		.split('\n')
		.map((l) => l.trim())
		.filter(
			(l) => l && l.toUpperCase() !== cod && !/^\d+\s*(cr|h)$/i.test(l) && !/^status\b/i.test(l)
		);
	return linhas.sort((a, b) => b.length - a.length)[0] ?? cod;
}

const norm = (c: string) => c.trim().toUpperCase();

/** Filho direto de `pai` que contém `el`. */
function filhoDireto(pai: Element, el: Element): Element | null {
	let atual: Element | null = el;
	while (atual && atual.parentElement !== pai) atual = atual.parentElement;
	return atual;
}

export function montarCopiaComConexoes(
	origem: HTMLElement,
	arestas: Aresta[],
	nomes: Record<string, string> = {}
): { el: HTMLElement; remover: () => void } {
	const escuro = document.documentElement.classList.contains('dark');
	const copia = origem.cloneNode(true) as HTMLElement;
	copia.style.zoom = '1';
	copia.style.gap = `${VAO_COLUNAS_PX}px`;
	copia.style.transition = 'none';
	// camada de setas da tela (hover/modo "todas") não entra na imagem
	for (const svg of copia.querySelectorAll(':scope > svg')) svg.remove();
	// contêiner em coluna: fluxograma em cima, legenda das trilhas embaixo
	const moldura = document.createElement('div');
	moldura.setAttribute('aria-hidden', 'true');
	moldura.style.cssText =
		'position:absolute;left:-100000px;top:0;display:inline-flex;flex-direction:column;background:hsl(var(--background));';
	moldura.appendChild(copia);
	document.body.appendChild(moldura);

	const colunas = [...copia.querySelectorAll<HTMLElement>('[data-semester]')].sort(
		(a, b) => Number(a.dataset.semester) - Number(b.dataset.semester)
	);
	const colunaDe = new Map<string, number>();
	const ordemAtual: string[][] = [];
	const listaDaColuna: (Element | null)[] = [];
	const itemDoCard = new Map<string, Element>();
	colunas.forEach((col, ci) => {
		const cards = [...col.querySelectorAll<HTMLElement>('[data-subject-code]')];
		const lista = cards[0] ? (filhoDireto(col, cards[0]) ?? null) : null;
		listaDaColuna.push(lista);
		const codigos: string[] = [];
		for (const card of cards) {
			const cod = norm(card.dataset.subjectCode ?? '');
			if (!cod || colunaDe.has(cod)) continue; // mesma matéria em 2 colunas: vale a primeira
			colunaDe.set(cod, ci);
			codigos.push(cod);
			const item = lista ? filhoDireto(lista, card) : null;
			if (item) itemDoCard.set(cod, item);
		}
		ordemAtual.push(codigos);
	});

	const { vizinhas, longas } = separarArestas(arestas, colunaDe);
	const trilhas = calcularTrilhas(arestas, colunaDe);
	const raizes = [...new Set([...trilhas.values()].map((t) => t.raiz))].sort(
		(a, b) => colunaDe.get(a)! - colunaDe.get(b)! || a.localeCompare(b)
	);
	const indiceDaRaiz = new Map(raizes.map((r, i) => [r, i]));
	const corDe = (cod: string) => {
		const t = trilhas.get(cod);
		return t
			? corDaTrilha(indiceDaRaiz.get(t.raiz)!, t.profundidade, escuro)
			: 'hsl(var(--muted-foreground))';
	};
	const nomeDe = new Map<string, string>();
	for (const card of copia.querySelectorAll<HTMLElement>('[data-subject-code]')) {
		const cod = norm(card.dataset.subjectCode ?? '');
		if (cod && !nomeDe.has(cod)) nomeDe.set(cod, nomes[cod] ?? nomeDoCard(card, cod));
	}
	const novaOrdem = ordenarPorBaricentro(ordemAtual, vizinhas);

	// reordena os cards de cada coluna (o que não é card da ordem fica no fim, na ordem de antes)
	novaOrdem.forEach((codigos, ci) => {
		const lista = listaDaColuna[ci];
		if (!lista) return;
		const itens = codigos.map((c) => itemDoCard.get(c)).filter((x): x is Element => !!x);
		const resto = [...lista.children].filter((ch) => !itens.includes(ch));
		for (const it of [...itens, ...resto]) lista.appendChild(it);
	});

	// "também requer …" logo abaixo do card
	for (const [para, des] of longas) {
		const item = itemDoCard.get(para);
		if (!item) continue;
		// cola no card de cima: anula o espaçamento da lista (o do card seguinte continua)
		const vao = Number.parseFloat(getComputedStyle(item.parentElement ?? item).rowGap) || 0;
		const nota = document.createElement('div');
		nota.style.cssText = `margin-top:${4 - vao}px;padding:0 6px;font-size:11px;line-height:14px;font-weight:600;color:hsl(var(--muted-foreground));`;
		nota.append('↳ também requer ');
		des.forEach((de, i) => {
			if (i) nota.append(', ');
			const cod = document.createElement('span');
			cod.textContent = de;
			cod.style.color = corDe(de);
			cod.style.fontWeight = '700';
			nota.append(cod);
		});
		item.insertAdjacentElement('afterend', nota);
	}

	// mede depois de reordenar/anotar e desenha as setas
	const base = copia.getBoundingClientRect();
	const caixas = new Map<string, Caixa>();
	for (const card of copia.querySelectorAll<HTMLElement>('[data-subject-code]')) {
		const cod = norm(card.dataset.subjectCode ?? '');
		if (caixas.has(cod)) continue;
		const r = card.getBoundingClientRect();
		caixas.set(cod, {
			left: r.left - base.left,
			right: r.right - base.left,
			top: r.top - base.top,
			bottom: r.bottom - base.top
		});
	}
	const rotas = rotearVizinhas(caixas, vizinhas, colunaDe);

	const svg = document.createElementNS(SVG_NS, 'svg');
	svg.setAttribute('width', String(Math.ceil(base.width)));
	svg.setAttribute('height', String(Math.ceil(base.height)));
	svg.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;overflow:visible;';
	const defs = document.createElementNS(SVG_NS, 'defs');
	svg.appendChild(defs);
	const attrs = (el: Element, a: Record<string, string | number>) => {
		for (const [k, v] of Object.entries(a)) el.setAttribute(k, String(v));
	};
	rotas.forEach((r, k) => {
		const [xs, ys] = r.pontos[0];
		const [xt, yt] = r.pontos[r.pontos.length - 1];
		const corIni = corDe(r.aresta.de);
		const corFim = corDe(r.aresta.para);
		const grad = document.createElementNS(SVG_NS, 'linearGradient');
		attrs(grad, {
			id: `exp-grad-${k}`,
			gradientUnits: 'userSpaceOnUse',
			x1: xs,
			y1: ys,
			x2: xt,
			y2: yt
		});
		for (const [offset, cor] of [
			['0', corIni],
			['1', corFim]
		]) {
			const stop = document.createElementNS(SVG_NS, 'stop');
			attrs(stop, { offset, 'stop-color': cor });
			grad.appendChild(stop);
		}
		const m = document.createElementNS(SVG_NS, 'marker');
		attrs(m, {
			id: `exp-seta-${k}`,
			markerUnits: 'userSpaceOnUse',
			markerWidth: 10,
			markerHeight: 8,
			refX: 9,
			refY: 4,
			orient: 'auto'
		});
		const p = document.createElementNS(SVG_NS, 'polygon');
		attrs(p, { points: '0 0, 9 4, 0 8', fill: corFim });
		m.appendChild(p);
		defs.append(grad, m);
		const path = document.createElementNS(SVG_NS, 'path');
		attrs(path, {
			d: caminhoArredondado(r.pontos),
			fill: 'none',
			stroke: `url(#exp-grad-${k})`,
			'stroke-width': 2.25,
			'stroke-linejoin': 'round',
			'marker-end': `url(#exp-seta-${k})`
		});
		svg.appendChild(path);
	});
	copia.insertBefore(svg, copia.firstChild);

	// legenda: uma faixa por trilha, com o gradiente da raiz ao fim da cadeia
	if (raizes.length) {
		const legenda = document.createElement('div');
		legenda.style.cssText =
			'display:flex;flex-wrap:wrap;gap:10px 22px;align-items:center;padding:4px 16px 20px;font-size:12px;font-weight:600;color:hsl(var(--foreground));';
		const titulo = document.createElement('span');
		titulo.textContent = 'Trilhas de pré-requisitos:';
		titulo.style.cssText = 'color:hsl(var(--muted-foreground));font-weight:700;';
		legenda.appendChild(titulo);
		for (const raiz of raizes) {
			const i = indiceDaRaiz.get(raiz)!;
			const item = document.createElement('span');
			item.style.cssText = 'display:inline-flex;align-items:center;gap:8px;';
			const faixa = document.createElement('span');
			faixa.style.cssText = `display:inline-block;width:34px;height:6px;border-radius:3px;background:linear-gradient(90deg, ${corDaTrilha(i, 0, escuro)}, ${corDaTrilha(i, 6, escuro)});`;
			const nome = nomeDe.get(raiz) ?? raiz;
			item.append(faixa, `${nome.charAt(0)}${nome.slice(1).toLowerCase()} (${raiz})`);
			legenda.appendChild(item);
		}
		moldura.appendChild(legenda);
	}

	return { el: moldura, remover: () => moldura.remove() };
}
