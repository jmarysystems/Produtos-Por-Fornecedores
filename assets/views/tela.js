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
    const disponiveis = produtos.filter((p) => !ligados.has(p.id));

    const { fechar, corpo } = ui.modal({
      titulo: 'Adicionar produto',
      largura: '620px',
      corpo: `
        <label class="campo"><span>Produto</span>
          <select name="produto_id">
            ${disponiveis.map((p) => `<option value="${ui.esc(p.id)}">${
              ui.esc(`${p.sku} — ${p.descricao}`)}</option>`).join('')}
          </select></label>
        <div class="linha-acoes">
          <button type="button" class="botao-primario" id="ok">Adicionar</button>
          <button type="button" id="cancelar">Cancelar</button>
        </div>`,
    });

    corpo.querySelector('#cancelar').addEventListener('click', fechar);
    corpo.querySelector('#ok').addEventListener('click', async () => {
      const produtoId = corpo.querySelector('[name="produto_id"]').value;
      if (!produtoId) return ui.toast('Escolha um produto.', 'erro');
      try {
        await criar('produto_por_fornecedor', { fornecedor_id: atual.id, produto_id: produtoId });
        fechar();
        ui.toast('Produto ligado ao fornecedor.');
        ctx.recarregar();
      } catch (erro) { ui.toast(erro.message, 'erro'); }
    });
  });
}
