// Produtos por fornecedor: escolhe o fornecedor e mantém os produtos ligados a ele.
import { listar, criar, excluir } from '../api.js';
import * as ui from '../ui.js';

export async function render(raiz, ctx) {
  ctx.setTitulo('Produtos por Fornecedor');

  const podeEditar = ctx.pode('cotacao', 'editar') || ctx.pode('produtos', 'editar');

  const [fornecedores, produtos, vinculos] = await Promise.all([
    listar('fornecedores', { ordem: 'razao_social' }),
    listar('produtos', { ordem: 'sku' }),
    listar('produto_por_fornecedor'),
  ]);

  const porFornecedor = {};
  for (const v of vinculos) {
    (porFornecedor[v.fornecedor_id] = porFornecedor[v.fornecedor_id] || []).push(v);
  }

  const atual = fornecedores[0] || null;

  raiz.innerHTML = `
    <div class="duas-colunas">
      <div class="cartao">
        <div class="cartao-topo"><h2>Fornecedores</h2></div>
        <div class="lista-usuarios">
          ${fornecedores.map((f) => `<button type="button" data-fornecedor="${ui.esc(f.id)}"
              class="${atual && f.id === atual.id ? 'ativo' : ''}">
            <span><span class="nome">${ui.esc(f.razao_social)}</span><br>
              <span class="doc">${ui.esc(f.cnpj_cpf || '—')}</span></span>
            <span class="sub">${(porFornecedor[f.id] || []).length}</span>
          </button>`).join('') || ui.vazio('Nenhum fornecedor cadastrado.')}
        </div>
      </div>

      <div class="cartao">
        <div class="cartao-topo">
          <h2>${atual ? ui.esc(atual.razao_social) : 'Produtos'}</h2>
          ${podeEditar && atual ? '<button type="button" class="botao-primario" id="adicionar">Adicionar produto</button>' : ''}
        </div>
        <div id="lista">${tabela(atual)}</div>
      </div>
    </div>`;

  function tabela(fornecedor) {
    if (!fornecedor) return ui.vazio('Escolha um fornecedor.');
    const itens = porFornecedor[fornecedor.id] || [];
    if (!itens.length) return ui.vazio('Nenhum produto ligado a este fornecedor.');
    return `
      <div class="tabela-rolagem"><table>
        <thead><tr><th>SKU</th><th>EAN</th><th>Descrição</th><th>Un.</th><th></th></tr></thead>
        <tbody>
          ${itens.map((v) => {
            const p = produtos.find((x) => x.id === v.produto_id) || {};
            return `<tr>
              <td class="mono">${ui.esc(p.sku || '—')}</td>
              <td class="mono">${ui.esc(p.ean || '—')}</td>
              <td>${ui.esc(p.descricao || '—')}</td>
              <td>${ui.esc(p.unidade || '—')}</td>
              <td class="acoes">${podeEditar
                ? `<button type="button" class="botao-pequeno botao-perigo" data-remover="${ui.esc(v.id)}">Remover</button>`
                : ''}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table></div>`;
  }

  for (const b of raiz.querySelectorAll('[data-fornecedor]')) {
    b.addEventListener('click', () => {
      const f = fornecedores.find((x) => x.id === b.dataset.fornecedor);
      raiz.querySelectorAll('[data-fornecedor]').forEach((x) => x.classList.toggle('ativo', x === b));
      raiz.querySelector('.cartao:last-child h2').textContent = f ? f.razao_social : 'Produtos';
      raiz.querySelector('#lista').innerHTML = tabela(f);
      ligarRemover();
    });
  }

  function ligarRemover() {
    for (const b of raiz.querySelectorAll('[data-remover]')) {
      b.addEventListener('click', async () => {
        try {
          await excluir('produto_por_fornecedor', b.dataset.remover);
          ui.toast('Vínculo removido.');
          ctx.recarregar();
        } catch (erro) { ui.toast(erro.message, 'erro'); }
      });
    }
  }
  ligarRemover();

  raiz.querySelector('#adicionar')?.addEventListener('click', () => {
    const ligados = new Set((porFornecedor[atual.id] || []).map((v) => v.produto_id));
    let escolhido = null;

    const { fechar, corpo } = ui.modal({
      titulo: 'Adicionar produto',
      largura: '680px',
      corpo: `
        <label class="campo"><span>Pesquisar produto (SKU, EAN ou descrição)</span>
          <input type="search" id="busca" autofocus placeholder="digite para procurar"></label>
        <div id="resultados" style="max-height:320px;overflow:auto;margin-top:8px"></div>
        <div class="sub" id="selecionado" style="margin-top:8px"></div>
        <div class="linha-acoes" style="margin-top:12px">
          <button type="button" class="botao-primario" id="ok" disabled>Adicionar</button>
          <button type="button" id="cancelar">Cancelar</button>
        </div>
        <div class="sub" id="info" style="margin-top:8px"></div>`,
    });

    const busca = corpo.querySelector('#busca');
    const resultados = corpo.querySelector('#resultados');
    const selecionado = corpo.querySelector('#selecionado');
    const info = corpo.querySelector('#info');
    const botaoOk = corpo.querySelector('#ok');

    let temporizador = null;

    async function procurar(termo) {
      const t = termo.trim();
      if (t.length < 2) {
        resultados.innerHTML = '<p class="sub">Digite ao menos 2 caracteres.</p>';
        return;
      }

      resultados.innerHTML = '<p class="sub">Procurando…</p>';

      try {
        const achados = await listar('produtos', {
          select: 'id, sku, ean, descricao, unidade',
          busca: t,
          ordem: 'sku',
          limite: 25,
        });

        const livres = achados.filter((p) => !ligados.has(p.id));

        if (!livres.length) {
          resultados.innerHTML = '<p class="sub">Nenhum produto encontrado (ou já ligado a este fornecedor).</p>';
          return;
        }

        resultados.innerHTML = `<div class="tabela-rolagem"><table>
          <thead><tr><th>SKU</th><th>EAN</th><th>Descrição</th><th></th></tr></thead>
          <tbody>
            ${livres.map((p) => `<tr>
              <td class="mono">${ui.esc(p.sku || '')}</td>
              <td class="mono">${ui.esc(p.ean || '—')}</td>
              <td>${ui.esc(p.descricao || '')}</td>
              <td><button type="button" class="botao-pequeno"
                    data-escolher="${ui.esc(p.id)}">Selecionar</button></td>
            </tr>`).join('')}
          </tbody>
        </table></div>`;

        for (const b of resultados.querySelectorAll('[data-escolher]')) {
          b.addEventListener('click', () => {
            escolhido = livres.find((p) => p.id === b.dataset.escolher);
            selecionado.innerHTML = escolhido
              ? `<strong>Selecionado:</strong> ${ui.esc(escolhido.sku)} — ${ui.esc(escolhido.descricao)}`
              : '';
            botaoOk.disabled = !escolhido;
          });
        }
      } catch (erro) {
        resultados.innerHTML = `<p class="sub">${ui.esc(erro.message)}</p>`;
      }
    }

    busca.addEventListener('input', () => {
      botaoOk.disabled = true;
      selecionado.innerHTML = '';
      escolhido = null;
      clearTimeout(temporizador);
      temporizador = setTimeout(() => procurar(busca.value), 350);
    });

    corpo.querySelector('#cancelar').addEventListener('click', fechar);
    botaoOk.addEventListener('click', async () => {
      if (!escolhido) return ui.toast('Escolha um produto.', 'erro');
      botaoOk.disabled = true;
      try {
        await criar('produto_por_fornecedor', {
          fornecedor_id: atual.id, produto_id: escolhido.id,
        });
        fechar();
        ui.toast('Produto ligado ao fornecedor.');
        ctx.recarregar();
      } catch (erro) {
        ui.toast(erro.message, 'erro');
        botaoOk.disabled = false;
      }
    });

    if (info) info.textContent = '';
  });
}
