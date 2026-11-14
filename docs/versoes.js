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
  {v:'2.36.0', data:'2026-11-14', itens:[
    'Compras parceladas com valores diferentes: marque "Ajustar o valor e a data de cada parcela" e edite cada parcela (o botão "Repetir ↓" copia o valor para as seguintes). O sistema mostra a soma das parcelas e a diferença para o total (juros ou desconto)',
    'Compras já lançadas: em "Ver compra" → "Editar parcelas e tipo" dá para corrigir o valor e o vencimento das parcelas ainda não pagas e trocar o tipo de despesa (por exemplo, para Capacitação)',
  ]},
  {v:'2.35.0', data:'2026-11-14', itens:[
    'Nova categoria de despesa "Capacitação", para os cursos e eventos dos dentistas pagos pelo consultório: Cursos e Especializações, Congressos e Eventos, Viagens e Hospedagem para Cursos, Livros e Assinaturas Científicas. Ela aparece também nos relatórios e no comparativo anual',
  ]},
  {v:'2.34.0', data:'2026-11-12', itens:[
    'Agenda semanal em grade, como a do dia: uma coluna por dia da semana, com horários, intervalo, dias fechados e linha da hora atual. Cada atendimento mostra o paciente, o procedimento e o dentista; clique para ver os detalhes ou num horário livre para agendar naquele dia. A lista por dia continua disponível no botão "Lista"',
  ]},
  {v:'2.33.1', data:'2026-11-12', itens:[
    'No computador, o sistema ocupa a largura inteira da tela, com o menu aberto ou recolhido',
  ]},
  {v:'2.33.0', data:'2026-11-12', itens:[
    'Menu lateral novo: logotipo e nome da clínica no topo (sem logotipo, aparece um monograma com as iniciais), item ativo destacado e opção de recolher o menu para ganhar espaço',
    'OdontoGestão e a versão do sistema foram para o rodapé do menu',
    'Menu do usuário no canto superior direito: aparência (claro, escuro, automático), novidades da versão e Sair',
  ]},
  {v:'2.32.0', data:'2026-11-12', itens:[
    'Comissão dos dentistas: agora é calculada pelo valor integral do procedimento e fica devida no atendimento (evolução confirmada), mesmo que o paciente pague parcelado. O que já tinha sido repassado por parcela é descontado, sem pagar em dobro',
    'Comissões futuras: mostram os procedimentos dos orçamentos aprovados que ainda não foram feitos, pelo valor integral, no nome do dentista responsável',
  ]},
  {v:'2.31.0', data:'2026-11-12', itens:[
    'Agenda: nova situação "Atendido". Vira Atendido sozinho quando a evolução é confirmada ou quando o paciente estava "Na clínica" e o horário do atendimento terminou; também pode ser marcado à mão (ex.: paciente que não foi marcado como chegou)',
    'Painel: pacientes atendidos no mês (com o número de atendimentos) e ticket médio (recebido no mês ÷ pacientes atendidos)',
  ]},
  {v:'2.30.2', data:'2026-11-12', itens:[
    'Conta Gmail com senha inicial liberada pela clínica: link "Recebi uma senha inicial da clínica" na entrada; no primeiro acesso entra sem criar senha, a senha é retirada e daí em diante entra só pelo Google',
  ]},
  {v:'2.30.1', data:'2026-11-11', itens:[
    'Comissões: linha de total com a soma da base e da comissão de cada dentista',
    'Comissões futuras: quanto cada dentista ainda tem a receber pelas parcelas que os pacientes ainda vão pagar (com detalhe por vencimento)',
  ]},
  {v:'2.30.0', data:'2026-11-11', itens:[
    'Comissão dos dentistas por %: o Master define a % de cada especialidade (Configurações → Comissões) e pode abrir exceções por dentista',
    'A comissão é calculada sobre o que o paciente pagou (valor cheio), na proporção dos procedimentos do orçamento; conta para quem executou o procedimento ou, antes disso, para o dentista responsável do orçamento',
    'Relatórios → Comissões: fechamento diário que lança o repasse de cada dentista em contas a pagar, com detalhe por paciente e procedimento e opção de desfazer; aviso no Painel quando há comissões a fechar',
    'Orçamento: campo "Dentista responsável" (já preenchido quando um dentista confirma o plano)',
  ]},
  {v:'2.29.1', data:'2026-11-11', itens:[
    'Entrada: ao digitar um e-mail Gmail no formulário, o campo de senha some e o botão vira "Continuar com Google", que abre a escolha da conta já sugerindo esse e-mail',
    'Senha incorreta agora lembra que conta Google entra pelo botão "Entrar com Google"',
  ]},
  {v:'2.29.0', data:'2026-11-11', itens:[
    'Fluxo de caixa: novo Resumo do caixa em blocos — disponível hoje, a creditar do cartão (com o dia em que cai), a receber de pacientes, a pagar (com vencidas em destaque) e saldo previsto no fim do período',
    'Saldo inicial da conta (opcional), para o "Disponível hoje" bater com o banco; faixa dos próximos 7 dias com o que entra, o que sai e o saldo previsto de cada dia',
    'Cartão: o prazo da maquininha passa a contar em dias úteis (sábado, domingo e feriados nacionais não contam); cada recebimento no cartão mostra "A creditar" ou "Creditado" e a data em que cai na conta',
  ]},
  {v:'2.28.0', data:'2026-11-11', itens:[
    'Usuários: ao cadastrar alguém com e-mail que não é Gmail, o sistema já cria o acesso com a senha inicial 123456 (vale 7 dias); no primeiro acesso a pessoa confirma o e-mail e é obrigada a criar a própria senha do OdontoGestão',
    'E-mail Gmail entra só pelo botão "Entrar com Google", escolhendo a conta, sem digitar senha',
    'Usuários: "Renovar senha inicial" quando venceu e "Enviar link de senha" para quem esqueceu; tela de entrada explica Google e senha inicial',
  ]},
  {v:'2.27.3', data:'2026-11-11', itens:[
    'Pacientes: o formulário de novo paciente (e de edição) abre no topo da lista, com o cursor no nome; antes aparecia no fim da lista e, com muitos pacientes, parecia que o botão não funcionava',
    'Busca do topo e busca da lista de Pacientes: quando o paciente não existe, oferecem "Cadastrar como novo paciente" (Enter também cadastra), já preenchendo o nome, o CPF ou o telefone digitado',
  ]},
  {v:'2.27.1', data:'2026-11-10', itens:[
    'Painel financeiro → Próximas despesas a pagar: botão "Pagar" em cada despesa, informando data (pode ser anterior) e valor pagos, forma e observação; valor maior (juros/multa) fica registrado, valor menor pode ser desconto ou pagamento parcial',
  ]},
  {v:'2.27.0', data:'2026-11-10', itens:[
    'Relatórios → Comparativo anual (desde 2021): entradas, faturamento bruto, taxas, saídas, resultado e margem; pacientes ativos, novos e ticket médio; atendimentos, faltas, orçamentos e conversão — com a variação de cada ano sobre o anterior',
    'Gráficos de entradas, saídas e resultado por ano e de qualquer indicador mês a mês comparando os anos; quebras por categoria de despesa, forma de pagamento e especialidade; planilha (CSV) para abrir no Excel/Numbers',
  ]},
  {v:'2.26.0', data:'2026-11-10', itens:[
    'Inadimplência: dar baixa direto no relatório com a data real do pagamento (sugere a data do vencimento), forma e observação; baixa parcial deixa o restante em aberto',
    'Inadimplência: baixa em lote (na data de cada vencimento ou numa data única), filtros por paciente, período e "só do sistema anterior", lista das conferências para desfazer',
    'Cancelar parcela que não era devida (com motivo): sai da inadimplência sem contar como recebida, fica registrada na ficha e pode ser restaurada',
    'Orçamento com validade (padrão 30 dias, ajustável em Configurações → Clínica): depois do prazo vira "Vencido", fica na ficha, sai dos pendentes e pede nova avaliação',
    'Procedimentos de orçamento vencido aparecem como "Plano vencido" e saem de Tratamentos em aberto; ao confirmar o plano de novo, voltam com o valor atual da tabela',
    'Relatório de orçamentos com filtro "Vencidos: chamar para nova avaliação", alerta de orçamentos vencendo em 5 dias no Painel e "Revalidar" (só Master)',
  ]},
  {v:'2.25.2', data:'2026-11-10', itens:[
    'Evolução: a lista de medidas/cores mostra o saldo de cada uma; quem não pode confirmar vê o aviso de que o dentista escolhe ao confirmar',
  ]},
  {v:'2.25.1', data:'2026-11-10', itens:[
    'Estoque com variações: cada material pode ter medidas, cores ou tipos, cada um com saldo, mínimo e custo próprios (arcos por liga, secção e arcada; resina por cor; braquetes por prescrição; limas por série; fio de sutura por número)',
    'Ligaduras separadas: elástica simples, corrente elástica e metálica',
    'Kits com itens opcionais: na manutenção ortodôntica, arco, corrente, ligadura metálica e tubo só saem se o dentista preencher; "+ outra" lança mais de uma medida (ex.: arco superior e inferior)',
    'Na compra e no atendimento, o sistema pede qual variação foi comprada ou usada; "Para repor" mostra exatamente o que comprar',
  ]},
  {v:'2.25.0', data:'2026-11-10', itens:[
    'Estoque de materiais (plano Completo ou módulo avulso): saldo, estoque mínimo, custo médio e valor em estoque',
    'Compras: cada item escolhe o destino (patrimônio, material de consumo para o estoque, ou outro, como material de escritório). A compra continua gerando as contas a pagar e o fluxo',
    'Kits por procedimento, com uma base inicial de consumo médio (restaurações, canal, extrações, ortodontia, prótese, HOF e mais) e o kit de toda consulta (EPI e descartáveis)',
    'Evolução: o dentista confere os materiais sugeridos pelo kit, ajusta as quantidades e a baixa acontece ao confirmar',
    'Custo de material por procedimento e por atendimento, comparado ao valor da tabela; alerta de materiais para repor no Painel',
  ]},
  {v:'2.24.2', data:'2026-11-09', itens:[
    'Sua clínica (acesso vitalício) fica sempre registrada na versão mais nova: não abre mais uma versão antiga que a tratava como teste encerrado',
  ]},
  {v:'2.24.1', data:'2026-11-09', itens:[
    'Sua clínica (do dono da plataforma): acesso grátis e vitalício, sempre na versão mais nova e com todas as personalizações ligadas (WhatsApp automático, análise de radiografia com IA e as próximas)',
  ]},
  {v:'2.24.0', data:'2026-11-09', itens:[
    'WhatsApp automático: "Personalizar mensagem" em cada aviso, com campos (paciente, clínica, data, hora, dentista, motivo), prévia e aprovação automática na Meta',
    'WhatsApp automático: consumo do mês (enviados, previsão, valor estimado) e limite mensal de avisos, com alerta no Painel a partir de 80%',
    'WhatsApp automático: bases espelho do teste rodam em simulação e página de diagnóstico do serviço',
    'WhatsApp automático: resposta automática opcional para mensagens escritas (para números só de avisos)',
  ]},
  {v:'2.23.0', data:'2026-11-09', itens:[
    'Personalização "WhatsApp automático" (piloto): pelo número da clínica, confirmação ao marcar a consulta, lembrete na véspera com Confirmo / Preciso remarcar (a resposta muda a agenda e aparece no Painel) e agenda do dia às 07:30 para os dentistas. Com modo simulação.',
  ]},
  {v:'2.22.0', data:'2026-11-09', itens:[
    'Agenda: o motivo do agendamento (avaliação, procedimento ou retorno) aparece logo abaixo do nome do paciente, também nos horários curtos da grade',
    'Agenda: clicar no nome do paciente agendado abre o prontuário dele; "Voltar à agenda" retorna para a agenda',
    'Personalização "Análise de radiografia com IA" (só nas clínicas escolhidas): achados sugeridos, número de raízes e condutos e traçado (raiz contínua, conduto tracejado) que o dentista corrige e salva. Apoio ao diagnóstico.',
  ]},
  {v:'2.21.0', data:'2026-10-31', itens:[
    'Configurações → Minha assinatura (Master): plano, valor, forma de pagamento, situação (teste, pago e ativo, pendente) e quantos dias faltam para o fim do teste ou para a próxima cobrança',
    'Sem avisos no Painel: os avisos do plano só aparecem nos 3 dias antes do fim do teste ou da renovação (cobrança recusada continua avisando)',
    'O quadro de planos não abre sozinho para quem já tem o plano pago',
  ]},
  {v:'2.20.1', data:'2026-10-31', itens:[
    'Assinatura: quando o Mercado Pago volta ao sistema sem o código da assinatura, a confirmação é feita pela busca da assinatura do plano escolhido',
  ]},
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
