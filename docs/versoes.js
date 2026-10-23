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
  {v:'2.11.0', data:'2026-10-23', itens:[
    'Todas as datas no padrão dd/mm/aaaa, inclusive nos campos de data (digitando ou pelo calendário)',
    'WhatsApp comercial da clínica obrigatório no cadastro: é por ele que saem agendamentos, lembretes e confirmações',
    'Antes do primeiro envio, o sistema lembra de conferir se o WhatsApp aberto é o comercial da clínica',
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
