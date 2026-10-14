/**
 * Monta, fora da tela, a cópia do fluxograma usada no PNG "Com todas as conexões":
 * cards reordenados, setas só entre semestres vizinhos e "também requer …" nos
 * cards cujo pré-requisito pula semestres. A tela do usuário não é tocada.
 *
 * A cópia é feita antes da captura (e não no `onclone` do html2canvas) porque o
 * texto extra muda a altura: o tamanho da imagem precisa ser medido depois.
 */
import {
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
/** Cores por semestre de origem (legíveis nos temas claro e escuro). */
const PALETA = [
	'#3b82f6',
	'#ec4899',
	'#10b981',
	'#f59e0b',
	'#8b5cf6',
	'#ef4444',
	'#06b6d4',
	'#84cc16',
	'#f97316',
	'#d946ef'
];

const norm = (c: string) => c.trim().toUpperCase();

/** Filho direto de `pai` que contém `el`. */
function filhoDireto(pai: Element, el: Element): Element | null {
	let atual: Element | null = el;
	while (atual && atual.parentElement !== pai) atual = atual.parentElement;
	return atual;
}

export function montarCopiaComConexoes(
	origem: HTMLElement,
	arestas: Aresta[]
): { el: HTMLElement; remover: () => void } {
	const copia = origem.cloneNode(true) as HTMLElement;
	copia.style.zoom = '1';
	copia.style.gap = `${VAO_COLUNAS_PX}px`;
	copia.style.transition = 'none';
	copia.style.position = 'absolute';
	copia.style.left = '-100000px';
	copia.style.top = '0';
	copia.setAttribute('aria-hidden', 'true');
	// camada de setas da tela (hover/modo "todas") não entra na imagem
	for (const svg of copia.querySelectorAll(':scope > svg')) svg.remove();
	document.body.appendChild(copia);

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
		nota.textContent = `↳ também requer ${des.join(', ')}`;
		nota.style.cssText = `margin-top:${4 - vao}px;padding:0 6px;font-size:11px;line-height:14px;font-weight:600;color:hsl(var(--muted-foreground));`;
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
	PALETA.forEach((cor, i) => {
		const m = document.createElementNS(SVG_NS, 'marker');
		for (const [k, v] of Object.entries({
			id: `exp-seta-${i}`,
			markerUnits: 'userSpaceOnUse',
			markerWidth: '10',
			markerHeight: '8',
			refX: '9',
			refY: '4',
			orient: 'auto'
		}))
			m.setAttribute(k, v);
		const p = document.createElementNS(SVG_NS, 'polygon');
		p.setAttribute('points', '0 0, 9 4, 0 8');
		p.setAttribute('fill', cor);
		m.appendChild(p);
		defs.appendChild(m);
	});
	svg.appendChild(defs);
	for (const r of rotas) {
		const i = r.coluna % PALETA.length;
		const path = document.createElementNS(SVG_NS, 'path');
		path.setAttribute('d', caminhoArredondado(r.pontos));
		path.setAttribute('fill', 'none');
		path.setAttribute('stroke', PALETA[i]);
		path.setAttribute('stroke-width', '2');
		path.setAttribute('stroke-linejoin', 'round');
		path.setAttribute('marker-end', `url(#exp-seta-${i})`);
		svg.appendChild(path);
	}
	copia.insertBefore(svg, copia.firstChild);

	return { el: copia, remover: () => copia.remove() };
}
