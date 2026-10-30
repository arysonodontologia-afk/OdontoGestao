// =====================================================================
// OdontoGestão — notas de versão (histórico que nunca se perde)
// ---------------------------------------------------------------------
// • "versão" = código comum, vai para TODAS as clínicas quando aprovada.
// • "#N" = número da melhoria no quadro de implementação da Plataforma.
//   Personalizações ficam no código de todas, mas só ligam nas clínicas
//   escolhidas (Plataforma → Clínicas → Gerenciar → Personalizações).
//   Ex.: uma clínica com a personalização #184 mostra "Ver 2.8 (184)".
// Ao publicar uma versão nova, acrescente a entrada NO TOPO.
// =====================================================================
window.NOTAS_VERSAO = [
  {v:'2.20.0', data:'2026-10-30', itens:[
    'Teste grátis sem falar com ninguém: o dono cadastra a própria clínica (e-mail e senha ou Google) e usa o plano Completo por 14 dias',
    'Demonstração em um clique (?demo=1): o sistema abre com pacientes, agenda e financeiro fictícios, sem gravar nada',
    'Página de vendas (conheca.html) com planos, demonstração e teste grátis',
    'Assinatura pelo Mercado Pago (Master → "Assinar agora"): escolhe o plano, paga no cartão e a liberação é automática; cobrança recusada avisa e, depois de 5 dias, deixa em modo de consulta',
  ]},
  {v:'2.19.0', data:'2026-10-29', itens:[
    'Aportes (Financeiro → Aportes): entrada no caixa e devolução ao aportador sem juros ou com valor combinado, em parcelas, de uma vez ou quando houver caixa',
    'Devoluções entram nas despesas a pagar e no alerta de saldo; aportes e devoluções ficam fora do resultado (faturamento e custos)',
    'Painel: card "Devido a aportadores" e acompanhamento do saldo devedor de cada aporte',
  ]},
  {v:'2.18.0', data:'2026-10-29', itens:[
    'Painel financeiro (semana, mês e trimestre): saldo em caixa, despesas a pagar, caixa depois de pagar e alerta de saldo negativo',
    'Gráficos de entradas x saídas, despesas por categoria, recebimentos por forma de pagamento e resultado dos últimos 6 meses',
    'Boleto parcelado: acréscimo de parcelamento sobre o valor integral, entrada mínima por Pix ou débito e tarifa do emissor descontada de cada boleto',
  ]},
  {v:'2.17.1', data:'2026-10-28', itens:[
    'Personalização (só nas bases escolhidas): Master pode dar desconto de até 100% no orçamento, com motivo obrigatório',
  ]},
  {v:'2.17.0', data:'2026-10-28', itens:[
    'Formas de pagamento (Configurações): dinheiro, Pix, boleto e outras com taxa e prazo; cartão com várias operadoras e bandeiras, cada uma com suas taxas',
    'Recebimento no cartão: taxa da operadora/bandeira por nº de parcelas descontada na hora, com o custo da taxa sempre à mostra',
    'Despesas que se repetem todo mês: valor fixo ou variável (os meses seguintes entram como estimado e você informa o valor real ao dar baixa)',
    'Compra com itens, entrada e parcelas para fornecedores, com "Ver compra" (itens, pago e saldo)',
    'Patrimônio: bens da clínica com valor de compra, depreciação e evolução do valor (só para consulta)',
  ]},
  {v:'2.16.0', data:'2026-10-27', itens:[
    'Publicar na produção pelo próprio ambiente de teste (Plataforma → Versões), sem depender do suporte',
    'Na mesma ação, enviar a nova versão para todos os clientes, para os marcados ou para ninguém (envio depois)',
    'Acompanhamento da publicação na tela: aguardando, publicando, publicada ou erro',
    'Nova base de cliente real criada pelo ambiente de teste (Bases dos clientes), com acesso por Google ou senha inicial 123456',
    'No primeiro acesso com a senha inicial, o sistema obriga a criar uma senha própria',
  ]},
  {v:'2.15.0', data:'2026-10-24', itens:[
    'Preferência musical no cadastro do paciente: estilos, artistas favoritos ou "prefere silêncio"',
    'Agenda: com o paciente na clínica, o botão 🎵 abre o app de música da clínica no estilo ou artista dele (sorteado entre as preferências)',
    'Configurações → Clínica: app de música da sala e playlist da clínica (link de qualquer plataforma)',
    'A playlist da clínica abre sozinha ao entrar no sistema, nos aparelhos marcados (ex.: computador da sala)',
    'Usuários: o Master pode promover outro usuário a Master (ou deixar de ser, se houver outro Master ativo)',
  ]},
  {v:'2.14.0', data:'2026-10-24', itens:[
    'Tratamentos em várias sessões (ex.: canal): na evolução o dentista indica "Finalizado nesta sessão" ou "Continua, precisa de retorno"',
    'Retornos sem custo adicional, com a sessão indicada na agenda e na evolução (início, retornos e finalização)',
    'Plano de tratamento com "Em andamento", número de sessões, aviso acima de 3 sessões e botões Finalizar/Reabrir (só dentista)',
    'Tabela de procedimentos: opção "Pode ter várias sessões" (ortodontia fica de fora: cada manutenção tem valor)',
  ]},
  {v:'2.13.0', data:'2026-10-24', itens:[
    'Atualização por cliente: no ambiente de teste, você escolhe os clientes e envia a versão com um botão',
    'Cada clínica abre a versão liberada para ela; quem não foi escolhido continua na versão padrão',
    'Versão do sistema na tela de login e no formulário enviado ao paciente',
  ]},
  {v:'2.12.0', data:'2026-10-24', itens:[
    'Orçamento: desconto ou acréscimo antes de aprovar, no total (% ou R$) e no valor de cada procedimento',
    'Limite de desconto para a equipe definido pelo Master (Configurações → Clínica); acima dele, só o Master',
    'Orçamento mostra valor de tabela, desconto/acréscimo, total final e quem ajustou',
  ]},
  {v:'2.11.0', data:'2026-10-23', itens:[
    'Todas as datas no padrão dd/mm/aaaa, inclusive nos campos de data (digitando ou pelo calendário)',
    'WhatsApp comercial da clínica obrigatório no cadastro: é por ele que saem agendamentos, lembretes e confirmações',
    'Antes do primeiro envio, o sistema lembra de conferir se o WhatsApp aberto é o comercial da clínica',
    'Agendamento: paciente pesquisado digitando o nome, CPF ou telefone; se não existir, oferece cadastrar na hora',
    'Agendamento: tratamento direto da tabela de procedimentos (paciente sem plano), que entra sozinho no plano de tratamento e na evolução',
  ]},
  {v:'2.10.2', data:'2026-10-24', itens:[
    'Cadastro do dentista com WhatsApp (obrigatório) e opção de receber a agenda do dia às 07:30',
    'Usuários: aviso nos dentistas que ainda não têm WhatsApp cadastrado',
  ]},
  {v:'2.10.1', data:'2026-10-23', itens:[
    'Dentista pode cadastrar paciente novo, inclusive direto do agendamento (botão "+ Novo paciente"), no computador e no celular',
  ]},
  {v:'2.10.0', data:'2026-10-23', itens:[
    'Importar de outro sistema (Configurações → Backup): pacientes, anamneses, odontograma, orçamentos, parcelas e agenda a partir do backup .zip em CSV',
    'Pacientes já cadastrados são completados, sem duplicar; importar de novo o mesmo arquivo não repete nada',
    'Orçamentos "não fechados" e histórico do sistema anterior (receitas, atestados, anotações) no prontuário',
  ]},
  {v:'2.9.1', data:'2026-10-22', itens:[
    'Plataforma do teste mostra as bases dos clientes (sem clínicas de teste avulsas)',
    'Abrir a base de um cliente busca na produção a versão e as melhorias aplicadas',
    'Pacientes fictícios carregados só quando você pedir, dentro da base',
  ]},
  {v:'2.9.0', data:'2026-10-22', itens:[
    'Oficina no ambiente de teste: lista dos clientes reais com plano, versão e personalizações',
    'Base espelho de cada cliente no teste, com os pacientes fictícios padrão',
    'Personalização aplicada na base real do cliente direto pelo teste ("Aplicar na produção")',
    'Sugestões dos clientes reais no teste, numeradas (S-N) e com a quantidade por cliente',
    'Quadro de melhorias centralizado no teste; melhorias previstas publicadas para as clínicas',
  ]},
  {v:'2.8.0', data:'2026-10-22', itens:[
    'Número da versão e das personalizações no sistema: "Ver 2.8 (184)"',
    'Notas de versão: no ambiente de teste aparece o que está aguardando aprovação',
    'Melhorias do quadro numeradas (#N) e personalizações por clínica, com histórico',
  ]},
  {v:'2.7.0', data:'2026-10-22', itens:[
    'Várias cadeiras (planos Clínico e Completo): dentistas diferentes no mesmo horário',
    'Agendamento escolhe a cadeira livre; conflito conferido por cadeira',
    'Grade do dia por dentista ou por cadeira',
  ]},
  {v:'2.6.1', data:'2026-10-22', itens:['Ambiente de teste com ícone, nome e cor próprios']},
  {v:'2.6.0', data:'2026-10-22', itens:[
    'Boas-vindas para clínica nova: planos, vantagens e melhorias previstas',
    'Sugestões de melhoria enviadas pela equipe de cada clínica, com resposta',
  ]},
  {v:'2.5.2', data:'2026-10-22', itens:['Master só aparece na agenda se atender como dentista (CRO obrigatório)']},
  {v:'2.5.1', data:'2026-10-22', itens:['Plataforma: botão Encerrar teste agora']},
  {v:'2.5.0', data:'2026-10-22', itens:[
    'Várias clínicas com dados separados',
    'Planos Essencial, Clínico e Completo, módulos avulsos e teste de 30 dias',
    'Painel da plataforma e quadro de implementação',
    'Ambiente de teste separado da produção',
  ]},
  {v:'2.4.2', data:'2026-10-19', itens:['Master pode excluir ou desativar outro Master']},
  {v:'2.4.1', data:'2026-10-19', itens:['Desativar, reativar e excluir usuários']},
  {v:'2.4.0', data:'2026-10-17', itens:['Anamnese e termo de consentimento pelo WhatsApp, com assinatura do paciente']},
  {v:'2.3.1', data:'2026-10-17', itens:['Dr./Dra. e saudação conforme o horário']},
  {v:'2.3.0', data:'2026-10-17', itens:['Cadastro completo da clínica']},
  {v:'2.2.0', data:'2026-10-17', itens:['Visual profissional, agenda em grade, tema claro e escuro']},
  {v:'2.0.0', data:'2026-10-17', itens:['Sistema na nuvem: login por e-mail e Google, computador e celular']},
];
