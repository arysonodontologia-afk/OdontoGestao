// OdontoGestão · Estoque de materiais de consumo (plano Completo ou módulo avulso "estoque")
// Entrada: pela tela de Compras do Financeiro (item com destino "Material de consumo").
// Saída: na evolução do paciente. Cada procedimento tem um kit padrão (e há um kit de toda consulta);
// o dentista confere e ajusta as quantidades, e a baixa acontece ao confirmar a evolução.
// Saldo e custo médio são calculados a partir das movimentações (state.estoqueMov), nunca gravados.
(function(){
'use strict';

// ---------------------------------------------------------------------------
// Base inicial: materiais (unidade de uso, embalagem comum, quanto vem nela, mínimo sugerido)
// e kits por procedimento (consumo médio por execução; procedimentos "por arcada" = por arcada).
// Valores de referência para começar: cada clínica ajusta conforme a própria rotina.
// ---------------------------------------------------------------------------
const UNIDADES=[['un','unidade'],['par','par'],['g','grama (g)'],['ml','mililitro (ml)'],['tubete','tubete'],['U','unidade de toxina (U)'],['cm','centímetro (cm)']];
const M=[ // [código, categoria, nome, unidade, embalagem, quanto vem, mínimo (unidades de uso)]
  ['luva','Descartáveis e EPI','Luva de procedimento','par','Caixa com 50 pares',50,25],
  ['mascara','Descartáveis e EPI','Máscara descartável','un','Caixa com 50',50,25],
  ['gorro','Descartáveis e EPI','Gorro descartável','un','Pacote com 100',100,25],
  ['babador','Descartáveis e EPI','Babador descartável','un','Pacote com 100',100,25],
  ['sugador','Descartáveis e EPI','Sugador descartável','un','Pacote com 40',40,20],
  ['copo','Descartáveis e EPI','Copo descartável','un','Pacote com 100',100,25],
  ['barreira','Descartáveis e EPI','Barreira plástica (por paciente)','un','Rolo (~200 pacientes)',200,30],
  ['envelope','Descartáveis e EPI','Envelope para esterilização','un','Caixa com 200',200,40],
  ['gaze','Descartáveis e EPI','Gaze','un','Pacote com 500',500,100],
  ['rolete','Descartáveis e EPI','Rolete de algodão','un','Pacote com 100',100,50],
  ['luva_est','Descartáveis e EPI','Luva cirúrgica estéril','par','Caixa com 50 pares',50,10],
  ['avental','Descartáveis e EPI','Avental descartável','un','Pacote com 10',10,10],
  ['campo','Descartáveis e EPI','Campo cirúrgico descartável','un','Pacote com 10',10,5],
  ['anest','Anestesia','Anestésico local','tubete','Caixa com 50 tubetes',50,25],
  ['agulha','Anestesia','Agulha gengival','un','Caixa com 100',100,20],
  ['anest_top','Anestesia','Anestésico tópico','g','Pote com 12 g',12,6],
  ['acido','Dentística','Ácido fosfórico 37%','ml','Seringa com 2,5 ml',2.5,2.5],
  ['adesivo','Dentística','Sistema adesivo','ml','Frasco com 5 ml',5,2],
  ['resina','Dentística','Resina composta','g','Seringa com 4 g',4,8],
  ['resina_flow','Dentística','Resina flow','g','Seringa com 2 g',2,2],
  ['civ','Dentística','Cimento de ionômero de vidro','g','Kit (pó 10 g)',10,5],
  ['microbrush','Dentística','Microaplicador (microbrush)','un','Tubo com 100',100,30],
  ['tira_poli','Dentística','Tira de poliéster','un','Pacote com 50',50,20],
  ['lixa','Dentística','Tira de lixa de acabamento','un','Caixa com 150',150,20],
  ['disco','Dentística','Disco de acabamento e polimento','un','Caixa com 50',50,20],
  ['cunha','Dentística','Cunha de madeira','un','Caixa com 100',100,20],
  ['matriz','Dentística','Matriz metálica','un','Pacote com 12',12,6],
  ['pino','Dentística','Pino de fibra de vidro','un','Caixa com 5',5,3],
  ['cim_resinoso','Dentística','Cimento resinoso','g','Seringa com 5 g',5,2],
  ['selante','Dentística','Selante de fóssulas e fissuras','g','Seringa com 2 g',2,1],
  ['gel_consult','Dentística','Gel clareador de consultório (aplicação)','un','Kit com 3 aplicações',3,1],
  ['barreira_geng','Dentística','Barreira gengival fotopolimerizável','g','Seringa com 2 g',2,2],
  ['gel_caseiro','Dentística','Gel clareador caseiro (seringa)','un','Kit com 4 seringas',4,4],
  ['placa_ac','Dentística','Placa de acetato / EVA','un','Pacote com 10',10,4],
  ['pasta_prof','Prevenção e Periodontia','Pasta profilática','g','Pote com 90 g',90,30],
  ['robinson','Prevenção e Periodontia','Escova de Robinson / taça de borracha','un','Pacote com 10',10,5],
  ['fluor','Prevenção e Periodontia','Flúor gel','ml','Frasco com 200 ml',200,20],
  ['clorex','Prevenção e Periodontia','Clorexidina 0,12% (bochecho)','ml','Frasco com 1.000 ml',1000,200],
  ['isolamento','Endodontia','Lençol de borracha (isolamento)','un','Caixa com 26',26,10],
  ['lima','Endodontia','Lima endodôntica','un','Caixa com 6',6,6],
  ['hipoclorito','Endodontia','Hipoclorito de sódio 2,5%','ml','Frasco com 1.000 ml',1000,200],
  ['edta','Endodontia','EDTA 17%','ml','Frasco com 20 ml',20,5],
  ['guta','Endodontia','Cone de guta-percha','un','Caixa com 120',120,30],
  ['papel','Endodontia','Cone de papel absorvente','un','Caixa com 200',200,40],
  ['cim_endo','Endodontia','Cimento obturador endodôntico','g','Kit com 10 g',10,2],
  ['hidroxido','Endodontia','Hidróxido de cálcio (pasta)','g','Seringa com 2 g',2,2],
  ['seringa_irr','Endodontia','Seringa descartável para irrigação','un','Caixa com 100',100,20],
  ['ponta_irr','Endodontia','Ponta / agulha de irrigação','un','Pacote com 20',20,10],
  ['prov','Endodontia','Restaurador provisório','g','Pote com 25 g',25,10],
  ['fio_sutura','Cirurgia e Implante','Fio de sutura','un','Caixa com 24 envelopes',24,10],
  ['lamina','Cirurgia e Implante','Lâmina de bisturi','un','Caixa com 100',100,20],
  ['esponja','Cirurgia e Implante','Esponja hemostática','un','Caixa com 10',10,5],
  ['soro','Cirurgia e Implante','Soro fisiológico','ml','Frasco com 250 ml',250,250],
  ['biomaterial','Cirurgia e Implante','Biomaterial (enxerto ósseo)','g','Frasco com 0,5 g',0.5,1],
  ['membrana','Cirurgia e Implante','Membrana de colágeno','un','Unidade',1,1],
  ['implante','Cirurgia e Implante','Implante dentário','un','Unidade',1,2],
  ['cicatrizador','Cirurgia e Implante','Cicatrizador','un','Unidade',1,2],
  ['braquete','Ortodontia','Braquete metálico','un','Kit com 20',20,20],
  ['braquete_est','Ortodontia','Braquete estético (cerâmico / safira)','un','Kit com 20',20,0],
  ['tubo','Ortodontia','Tubo ortodôntico (molar)','un','Pacote com 10',10,4],
  ['fio_orto','Ortodontia','Fio ortodôntico (arco)','un','Pacote com 10',10,10],
  ['ligadura','Ortodontia','Ligadura elástica','un','Pacote com 1.000',1000,100],
  ['resina_orto','Ortodontia','Resina ortodôntica (colagem)','g','Seringa com 4 g',4,4],
  ['primer_orto','Ortodontia','Primer ortodôntico','ml','Frasco com 6 ml',6,2],
  ['elastico','Ortodontia','Elástico intermaxilar','un','Pacote com 100',100,50],
  ['cera','Ortodontia','Cera ortodôntica','un','Caixa com 50',50,10],
  ['fio_cont','Ortodontia','Fio para contenção (segmento)','un','Rolo (~30 contenções)',30,5],
  ['alginato','Moldagem e Prótese','Alginato','g','Pacote com 410 g',410,410],
  ['gesso','Moldagem e Prótese','Gesso pedra','g','Pacote com 1 kg',1000,1000],
  ['sil_pesada','Moldagem e Prótese','Silicone de moldagem (pesada)','g','Pote com 300 g',300,100],
  ['sil_leve','Moldagem e Prótese','Silicone de moldagem (leve)','ml','Tubo com 50 ml',50,10],
  ['fio_retrator','Moldagem e Prótese','Fio retrator','cm','Frasco com 254 cm',254,50],
  ['acrilica','Moldagem e Prótese','Resina acrílica autopolimerizável','g','Kit (pó 70 g)',70,20],
  ['cim_prov','Moldagem e Prótese','Cimento provisório','g','Kit com 25 g',25,5],
  ['toxina','Harmonização Orofacial','Toxina botulínica','U','Frasco com 100 U',100,100],
  ['ah','Harmonização Orofacial','Ácido hialurônico','ml','Seringa com 1 ml',1,2],
  ['canula','Harmonização Orofacial','Cânula / agulha para preenchimento','un','Caixa com 20',20,5],
  ['seringa_ins','Harmonização Orofacial','Seringa de insulina','un','Pacote com 100',100,20],
  ['antisseptico','Harmonização Orofacial','Antisséptico (clorexidina 2% alcoólica)','ml','Frasco com 100 ml',100,30],
  ['filme_rx','Radiologia','Filme radiográfico / capa do sensor','un','Caixa com 150',150,30],
];
const EPI_CIR=[['luva_est',2],['avental',2],['campo',1]];
const ANEST=(n)=>[['anest',n],['agulha',1]];
const RESTAURA=(resina,extra)=>[...ANEST(1),['acido',0.1],['adesivo',0.04],['microbrush',2],['resina',resina],['rolete',4],['disco',1],...(extra||[])];
const ENDO=(lima,hipo,edta,guta,papel,cim,ser,pon,anest)=>[...ANEST(anest),['isolamento',1],['lima',lima],['hipoclorito',hipo],['edta',edta],['guta',guta],['papel',papel],['cim_endo',cim],['seringa_irr',ser],['ponta_irr',pon],['prov',0.3]];
const ORTO_INST=(braq)=>[[braq,10],['tubo',2],['fio_orto',1],['ligadura',12],['resina_orto',0.4],['primer_orto',0.05],['acido',0.1],['microbrush',2],['cera',0.5]];
// chave = trecho do nome do procedimento (sem acento, minúsculo); o primeiro que casar vale
const K=[
  ['restauracao em resina composta (1 face)',RESTAURA(0.3)],
  ['restauracao em resina composta (2 faces)',RESTAURA(0.5,[['tira_poli',1],['cunha',1],['lixa',1]])],
  ['restauracao em resina composta (3 ou mais faces)',RESTAURA(0.8,[['tira_poli',1],['cunha',1],['lixa',1],['matriz',0.5]])],
  ['restauracao em ionomero',[['civ',0.3],['microbrush',1],['rolete',4]]],
  ['restauracao em dente deciduo',[...ANEST(1),['civ',0.3],['microbrush',1],['rolete',2]]],
  ['reconstrucao de coroa com pino',[...RESTAURA(0.8,[['pino',1],['cim_resinoso',0.3],['tira_poli',1]])]],
  ['faceta de resina direta',[['acido',0.15],['adesivo',0.05],['microbrush',2],['resina',0.6],['tira_poli',1],['lixa',2],['disco',2]]],
  ['fechamento de diastema',[['acido',0.1],['adesivo',0.04],['microbrush',2],['resina',0.4],['tira_poli',2],['lixa',2],['disco',1]]],
  ['polimento e ajuste de restauracao',[['disco',2],['lixa',1]]],
  ['clareamento caseiro',[['gel_caseiro',2],['placa_ac',1],['alginato',25],['gesso',100]]],
  ['clareamento dental',[['gel_consult',0.5],['barreira_geng',0.3]]],
  ['selante',[['selante',0.05],['acido',0.05],['microbrush',1],['rolete',2]]],
  ['fluor',[['fluor',2]]],
  ['profilaxia infantil',[['pasta_prof',2],['robinson',0.5]]],
  ['profilaxia + raspagem',[...ANEST(2),['pasta_prof',3],['robinson',0.5],['gaze',4],['clorex',15]]],
  ['raspagem e alisamento',[...ANEST(2),['gaze',4],['clorex',15]]],
  ['profilaxia / limpeza',[['pasta_prof',3],['robinson',0.5]]],
  ['profilaxia / higiene (pne)',[['pasta_prof',3],['robinson',0.5]]],
  ['manutencao periodontal',[['pasta_prof',5],['robinson',1],['gaze',2]]],
  ['tratamento de canal - unirradicular',ENDO(2,20,2,4,6,0.2,2,1,2)],
  ['tratamento de canal - birradicular',ENDO(4,35,3,8,12,0.35,3,2,2)],
  ['tratamento de canal - multirradicular',ENDO(6,50,4,12,18,0.5,4,3,3)],
  ['retratamento endodontico',ENDO(6,60,5,12,18,0.5,4,3,3)],
  ['pulpotomia',[...ANEST(1),['isolamento',1],['hidroxido',0.3],['civ',0.3],['rolete',4]]],
  ['pulpectomia',[...ANEST(2),['isolamento',1],['lima',2],['hipoclorito',15],['papel',4],['hidroxido',0.5],['prov',0.3],['seringa_irr',1]]],
  ['curativo de demora',[['isolamento',1],['hipoclorito',10],['papel',4],['hidroxido',0.5],['prov',0.3],['seringa_irr',1]]],
  ['extracao de terceiro molar',[...ANEST(3),['lamina',1],['gaze',8],['fio_sutura',1],['soro',50],...EPI_CIR]],
  ['exodontia de dente incluso',[...ANEST(3),['lamina',1],['gaze',8],['fio_sutura',1],['soro',50],...EPI_CIR]],
  ['exodontia de dente deciduo',[['anest_top',0.2],...ANEST(1),['gaze',2]]],
  ['exodontia de resto radicular',[...ANEST(2),['gaze',4],['fio_sutura',1],['soro',20]]],
  ['extracao dentaria simples',[...ANEST(2),['gaze',4],['fio_sutura',1],['soro',20]]],
  ['frenectomia',[...ANEST(2),['lamina',1],['gaze',4],['fio_sutura',1],['soro',20]]],
  ['biopsia',[...ANEST(1),['lamina',1],['gaze',4],['fio_sutura',1]]],
  ['drenagem de abscesso',[...ANEST(1),['lamina',1],['gaze',4],['soro',20]]],
  ['remocao de sutura',[['gaze',2],['soro',10]]],
  ['implante unitario',[...ANEST(3),['lamina',1],['gaze',8],['fio_sutura',1],['soro',100],['clorex',15],['implante',1],...EPI_CIR]],
  ['reabertura e instalacao de cicatrizador',[...ANEST(1),['lamina',1],['cicatrizador',1],['gaze',2],['fio_sutura',1]]],
  ['enxerto osseo',[...ANEST(2),['lamina',1],['biomaterial',0.5],['membrana',1],['fio_sutura',1],['gaze',4],['soro',50],...EPI_CIR]],
  ['levantamento de seio',[...ANEST(3),['lamina',1],['biomaterial',1],['membrana',1],['fio_sutura',1],['gaze',6],['soro',80],...EPI_CIR]],
  ['instalacao de aparelho ortodontico fixo',ORTO_INST('braquete')],
  ['aparelho ortodontico estetico',ORTO_INST('braquete_est')],
  ['manutencao mensal do aparelho',[['ligadura',12],['fio_orto',0.5]]],
  ['colagem / recolagem de braquete',[['braquete',1],['resina_orto',0.05],['primer_orto',0.01],['acido',0.05],['microbrush',1]]],
  ['remocao do aparelho',[['disco',1],['pasta_prof',2]]],
  ['instalacao de contencao',[['fio_cont',1],['resina_flow',0.2],['acido',0.1],['adesivo',0.03],['microbrush',2]]],
  ['documentacao ortodontica',[['alginato',25],['gesso',100]]],
  ['coroa provisoria',[['acrilica',2],['cim_prov',0.3]]],
  ['coroa protetica em porcelana',[...ANEST(1),['sil_pesada',15],['sil_leve',3],['fio_retrator',3],['acrilica',2],['cim_prov',0.3]]],
  ['coroa de zirconia',[...ANEST(1),['sil_pesada',15],['sil_leve',3],['fio_retrator',3],['acrilica',2],['cim_prov',0.3]]],
  ['faceta / laminado de porcelana',[...ANEST(1),['sil_pesada',15],['sil_leve',3],['fio_retrator',3]]],
  ['protese total removivel',[['alginato',30],['gesso',150]]],
  ['protese parcial removivel',[['alginato',30],['gesso',150]]],
  ['protetor bucal esportivo',[['alginato',25],['gesso',100],['placa_ac',1]]],
  ['placa miorrelaxante',[['alginato',50],['gesso',200]]],
  ['toxina botulinica para bruxismo',[['toxina',50],['seringa_ins',2],['antisseptico',5],['gaze',2]]],
  ['toxina botulinica — terco superior',[['toxina',30],['seringa_ins',2],['antisseptico',5],['gaze',2]]],
  ['toxina botulinica — tres tercos',[['toxina',60],['seringa_ins',3],['antisseptico',5],['gaze',2]]],
  ['preenchimento labial',[['ah',1],['canula',1],['anest_top',1],['antisseptico',5],['gaze',2]]],
  ['preenchimento de sulco',[['ah',1],['canula',1],['antisseptico',5],['gaze',2]]],
  ['preenchimento de malar',[['ah',2],['canula',2],['antisseptico',5],['gaze',2]]],
  ['rinomodelacao',[['ah',0.5],['canula',1],['antisseptico',5],['gaze',2]]],
  ['skinbooster',[['ah',1],['seringa_ins',2],['antisseptico',5],['gaze',2]]],
  ['radiografia periapical',[['filme_rx',1]]],
  ['radiografia interproximal',[['filme_rx',2]]],
];
// kit de toda consulta (EPI e descartáveis da cadeira): sai uma vez por atendimento realizado
const KIT_CONSULTA=[['luva',2],['mascara',2],['gorro',2],['babador',1],['sugador',1],['copo',1],['barreira',1],['envelope',2]];
const ID_CONSULTA='__consulta';
const idBase=c=>'m-'+c;
const BASE_VERSAO=1;

// ---------------------------------------------------------------------------
// acesso, cálculo de saldo e custo médio
// ---------------------------------------------------------------------------
function liberado(){ return typeof temRecurso==='function' && temRecurso('estoque'); }
function eu(){ return currentUser(); }
function podeVer(){ const u=eu(); if(!u||!liberado()) return false; const p=permsDe(u); return u.tipo==='master'||p.procedimentos||p.financeiro||ehDentista(u); }
function podeGerir(){ const u=eu(); if(!u) return false; const p=permsDe(u); return u.tipo==='master'||p.procedimentos||p.financeiro; }
function veCusto(){ const u=eu(); return !!u && (u.tipo==='master'||permsDe(u).financeiro); }
window.estoqueLiberado=liberado; window.estoquePodeVer=podeVer;

const num=v=>{ const n=typeof v==='number'?v:lerValor(v); return isFinite(n)?n:0; };
const r4=v=>Math.round((+v||0)*10000)/10000;
function fmtQtd(q,un){ const n=Math.round((+q||0)*1000)/1000; return n.toLocaleString('pt-BR',{maximumFractionDigits:3})+(un?' '+un:''); }
function fmtCusto(v){ const n=+v||0; return n>0&&n<0.1?'R$ '+n.toLocaleString('pt-BR',{minimumFractionDigits:3,maximumFractionDigits:4}):fmtMoney(n); }
function materiais(){ return (state.materiais||[]).filter(m=>!m.excluido); }
function matPorId(id){ return (state.materiais||[]).find(m=>m.id===id); }
function kits(){ return state.kits||[]; }
function kitDe(id){ return kits().find(k=>k.id===id); }

// percorre as movimentações em ordem: saldo e custo médio ponderado (móvel) de cada material
let cache=null, cacheChave='';
function calcular(){
  const movs=state.estoqueMov||[];
  const chave=movs.length+'|'+(state.materiais||[]).length+'|'+(movs.length?movs[movs.length-1].id:'');
  if(cache && chave===cacheChave && cache.ref===movs) return cache;
  const r={}; (state.materiais||[]).forEach(m=>{ r[m.id]={saldo:0,custo:0,entradas:0,saidas:0}; });
  movs.slice().sort((a,b)=>((a.data||'')+(a.em||'')).localeCompare((b.data||'')+(b.em||''))).forEach(mv=>{
    const s=r[mv.mid]||(r[mv.mid]={saldo:0,custo:0,entradas:0,saidas:0}); const q=+mv.qtd||0; s.n=(s.n||0)+1;
    if(mv.tipo==='entrada'){
      const cu=+mv.custoUnit||0;
      if(cu>0){ const base=Math.max(s.saldo,0); s.custo=(base*s.custo+q*cu)/((base+q)||1); }
      s.saldo+=q; s.entradas+=q;
    } else if(mv.tipo==='saida'){ s.saldo-=q; s.saidas+=q; }
    else if(mv.tipo==='ajuste'){ s.saldo+=q; }
  });
  cache={ref:movs,r}; cacheChave=chave; return cache;
}
function infoMat(id){ return calcular().r[id]||{saldo:0,custo:0,entradas:0,saidas:0}; }
window.estoqueSaldo=id=>infoMat(id).saldo;
window.estoqueCustoMedio=id=>infoMat(id).custo;
function situacao(m){ const s=infoMat(m.id).saldo; if(!controlado(m.id)) return ['Sem movimento','sit-agendado']; if(s<=0) return ['Zerado','sit-faltou']; if(m.minimo>0 && s<m.minimo) return ['Abaixo do mínimo','sit-nao_vem']; return ['OK','sit-chegou']; }
// só entra no alerta o material que já teve movimento (o resto da base inicial ainda não é controlado)
function controlado(id){ return !!infoMat(id).n; }
function abaixoMinimo(){ return materiais().filter(m=>m.ativo!==false && controlado(m.id) && infoMat(m.id).saldo<(+m.minimo||0.0001)); }
window.estoqueAbaixoMinimo=()=>liberado()?abaixoMinimo().length:0;

// ---------------------------------------------------------------------------
// base inicial (uma vez por clínica): materiais + kits dos procedimentos que existem no catálogo
// ---------------------------------------------------------------------------
function chaveNome(t){ return normTxt(t).replace(/\s+/g,' ').trim(); }
function kitBasePara(nomeProc){ const n=chaveNome(nomeProc); const k=K.find(([t])=>n.includes(t)); return k?k[1]:null; }
function garantirBase(){
  if(!liberado()) return false;
  state.meta=state.meta||{};
  if((state.meta.estoqueBase||0)>=BASE_VERSAO) return false;
  if(!(state.procedimentos||[]).length) return false;   // catálogo ainda não carregado
  state.materiais=state.materiais||[]; state.kits=state.kits||[]; state.estoqueMov=state.estoqueMov||[];
  const ids=new Set(state.materiais.map(m=>m.id)), nomes=new Set(state.materiais.map(m=>chaveNome(m.nome)));
  M.forEach(([c,cat,nome,un,emb,porEmb,min])=>{ if(!ids.has(idBase(c)) && !nomes.has(chaveNome(nome))) state.materiais.push({id:idBase(c),nome,categoria:cat,unidade:un,embalagem:emb,porEmbalagem:porEmb,minimo:min,ativo:true,base:true}); });
  const existe=id=>state.materiais.some(m=>m.id===id);
  const montar=l=>l.filter(([c])=>existe(idBase(c))).map(([c,q])=>({mid:idBase(c),qtd:q}));
  if(!kitDe(ID_CONSULTA)) state.kits.push({id:ID_CONSULTA,itens:montar(KIT_CONSULTA),base:true});
  (state.procedimentos||[]).forEach(pr=>{ if(kitDe(pr.id)) return; const b=kitBasePara(pr.nome); if(b) state.kits.push({id:pr.id,itens:montar(b),base:true}); });
  state.meta.estoqueBase=BASE_VERSAO;
  return true;
}
window.estoqueGarantirBase=function(){ if(garantirBase()) saveData(); };

// ---------------------------------------------------------------------------
// baixa na evolução: kit sugerido, rascunho editável e gravação ao confirmar
// ---------------------------------------------------------------------------
const rascunho={};   // evolId -> [{mid,qtd,origem}]
function procCatalogo(rec){
  if(!rec) return null;
  return (rec.procId && (state.procedimentos||[]).find(pr=>pr.id===rec.procId)) || (state.procedimentos||[]).find(pr=>chaveNome(pr.nome)===chaveNome(rec.nome)) || null;
}
function multiplicador(rec,pr){ return (pr&&pr.escopo==='arcada'&&rec&&rec.arco==='ambos')?2:1; }
function sugestaoKit(p,e){
  const it=[]; const add=(mid,qtd,origem)=>{ if(!matPorId(mid)||!(qtd>0)) return; const x=it.find(y=>y.mid===mid&&y.origem===origem); if(x) x.qtd=r4(x.qtd+qtd); else it.push({mid,qtd:r4(qtd),origem}); };
  const kc=kitDe(ID_CONSULTA); if(kc) kc.itens.forEach(i=>add(i.mid,+i.qtd,ID_CONSULTA));
  refsDaEvol(e).forEach(id=>{ const rec=findProcedimentoRecordById(p,id); if(!rec || rec.status==='Realizado anteriormente') return;
    const pr=procCatalogo(rec); const k=pr&&kitDe(pr.id); if(!k) return; const mult=multiplicador(rec,pr);
    k.itens.forEach(i=>add(i.mid,(+i.qtd||0)*mult,pr.id)); });
  return it;
}
function itensRascunho(p,e){ if(!rascunho[e.id]) rascunho[e.id]=sugestaoKit(p,e); return rascunho[e.id]; }
function nomeOrigem(o){ if(o===ID_CONSULTA) return 'Consulta'; if(o==='avulso') return 'Incluído'; const pr=(state.procedimentos||[]).find(x=>x.id===o); return pr?pr.nome:''; }
function opcoesMateriais(sel){
  const cats={}; materiais().filter(m=>m.ativo!==false).forEach(m=>{ (cats[m.categoria||'Outros']=cats[m.categoria||'Outros']||[]).push(m); });
  return '<option value="">Incluir material…</option>'+Object.keys(cats).sort().map(c=>`<optgroup label="${esc(c)}">${cats[c].sort((a,b)=>a.nome.localeCompare(b.nome)).map(m=>`<option value="${m.id}" ${sel===m.id?'selected':''}>${esc(m.nome)} (${esc(m.unidade)})</option>`).join('')}</optgroup>`).join('');
}
window.estoqueEvolHtml=function(p,e,podeConfirmar){
  if(!liberado() || e.falta || e.confirmado) return '';
  if(!(state.materiais||[]).length){ if(garantirBase()) setTimeout(()=>{ saveData(); render(); },0); return ''; }
  const l=itensRascunho(p,e);
  const linhas=l.map((i,ix)=>{ const m=matPorId(i.mid); if(!m) return ''; const s=infoMat(m.id).saldo, falta=s<i.qtd;
    return `<tr><td>${esc(m.nome)}<div class="muted" style="font-size:11.5px">${esc(nomeOrigem(i.origem))}</div></td>
      <td style="white-space:nowrap">${podeConfirmar?`<input data-evmat="${e.id}" data-ix="${ix}" inputmode="decimal" value="${esc(String(i.qtd).replace('.',','))}" style="width:78px" aria-label="Quantidade de ${esc(m.nome)}">`:esc(fmtQtd(i.qtd))} ${esc(m.unidade)}</td>
      <td class="muted" style="font-size:12px;white-space:nowrap">${falta?`<span style="color:var(--warn)">em estoque: ${esc(fmtQtd(s,m.unidade))}</span>`:'em estoque: '+esc(fmtQtd(s,m.unidade))}</td>
      <td>${podeConfirmar?`<button type="button" class="btn-icone peq btn-perigo" data-evmatrm="${e.id}" data-ix="${ix}" aria-label="Tirar ${esc(m.nome)}">${ICONES.lixo}</button>`:''}</td></tr>`; }).join('');
  return `<details class="est-evol" ${l.length?'':'open'}><summary><strong>Materiais usados</strong> <span class="muted">· ${l.length} ite${l.length===1?'m':'ns'}, saem do estoque ao confirmar</span></summary>
    ${l.length?`<div class="overflow"><table class="est-evol-t"><tbody>${linhas}</tbody></table></div>`:'<p class="muted" style="margin:6px 0">Nenhum material sugerido para este atendimento.</p>'}
    ${podeConfirmar?`<div style="display:flex;gap:8px;align-items:center;margin-top:6px;flex-wrap:wrap"><select data-evmatadd="${e.id}" style="max-width:340px">${opcoesMateriais('')}</select><span class="muted" style="font-size:12px">Confira as quantidades: o kit é uma média e pode ser ajustado.</span></div>`:''}
  </details>`;
};
window.estoqueEvolLigar=function(p){
  document.querySelectorAll('[data-evmat]').forEach(inp=>inp.addEventListener('input',()=>{ const l=rascunho[inp.getAttribute('data-evmat')]; if(!l) return; const it=l[+inp.getAttribute('data-ix')]; if(it) it.qtd=Math.max(0,num(inp.value)); }));
  document.querySelectorAll('[data-evmatrm]').forEach(b=>b.addEventListener('click',()=>{ const l=rascunho[b.getAttribute('data-evmatrm')]; if(l){ l.splice(+b.getAttribute('data-ix'),1); render(); } }));
  document.querySelectorAll('[data-evmatadd]').forEach(s=>s.addEventListener('change',()=>{ const eid=s.getAttribute('data-evmatadd'); if(!s.value) return; const e=(p.evolucao||[]).find(x=>x.id===eid); if(!e) return;
    const l=itensRascunho(p,e); const x=l.find(i=>i.mid===s.value&&i.origem==='avulso'); if(x) x.qtd=r4(x.qtd+1); else l.push({mid:s.value,qtd:1,origem:'avulso'}); render();
    setTimeout(()=>{ const ins=document.querySelectorAll(`[data-evmat="${eid}"]`); if(ins.length){ const d=ins[ins.length-1].closest('details'); if(d) d.open=true; ins[ins.length-1].focus(); ins[ins.length-1].select(); } },30); }));
};
// chamado ao confirmar a evolução (antes de salvar): grava os materiais na evolução e a saída no estoque
window.estoqueBaixarEvol=function(p,e){
  if(!liberado() || e.falta || !(state.materiais||[]).length) return;
  document.querySelectorAll(`[data-evmat="${e.id}"]`).forEach(inp=>{ const l=rascunho[e.id]; const it=l&&l[+inp.getAttribute('data-ix')]; if(it) it.qtd=Math.max(0,num(inp.value)); });
  const l=itensRascunho(p,e).filter(i=>i.qtd>0 && matPorId(i.mid));
  if(!l.length){ delete rascunho[e.id]; return; }
  state.estoqueMov=state.estoqueMov||[];
  const u=eu(), em=new Date().toISOString();
  e.materiais=l.map(i=>{ const m=matPorId(i.mid), c=infoMat(i.mid).custo;
    state.estoqueMov.push({id:uid(),mid:i.mid,tipo:'saida',qtd:r4(i.qtd),data:e.data||hojeISO(),em,custoUnit:r4(c),pacienteId:p.id,pacienteNome:p.nome,evolId:e.id,procId:i.origem,procNome:nomeOrigem(i.origem),porNome:u?nomeExibicao(u):''});
    return {mid:i.mid,nome:m.nome,unidade:m.unidade,qtd:r4(i.qtd),custoUnit:r4(c),origem:i.origem}; });
  e.custoMateriais=r2(e.materiais.reduce((s,i)=>s+i.qtd*i.custoUnit,0));
  delete rascunho[e.id]; cache=null;
};
window.estoqueEvolFeitaHtml=function(e){
  if(!e.materiais||!e.materiais.length) return '';
  return `<details class="est-evol"><summary class="muted" style="font-size:13px">Materiais usados: ${e.materiais.length} ite${e.materiais.length===1?'m':'ns'}${veCusto()&&e.custoMateriais?` · custo ${esc(fmtMoney(e.custoMateriais))}`:''}</summary>
    <ul style="margin:6px 0 0;padding-left:18px;font-size:13px">${e.materiais.map(i=>`<li>${esc(i.nome)}: ${esc(fmtQtd(i.qtd,i.unidade))}${veCusto()&&i.custoUnit?` <span class="muted">(${esc(fmtCusto(i.qtd*i.custoUnit))})</span>`:''}</li>`).join('')}</ul></details>`;
};

// ---------------------------------------------------------------------------
// entrada pela compra (Financeiro → Lançar despesa → Compra com itens)
// ---------------------------------------------------------------------------
window.estoqueOpcoesCompra=function(sel){ return '<option value="">Escolha o material…</option><option value="__novo">➕ Cadastrar material novo…</option>'+opcoesMateriais(sel).replace('<option value="">Incluir material…</option>',''); };
window.estoqueMaterial=matPorId;
window.estoqueEntradasDaCompra=function(compra,itens){
  if(!liberado()) return 0;
  state.estoqueMov=state.estoqueMov||[]; let n=0; const em=new Date().toISOString();
  itens.forEach(it=>{ if(it.destino!=='estoque' || !it.mid) return; const m=matPorId(it.mid); if(!m) return; const por=+m.porEmbalagem||1;
    state.estoqueMov.push({id:uid(),mid:m.id,tipo:'entrada',qtd:r4(it.qtd*por),custoUnit:r4(it.unit/por),data:compra.data,em,compraId:compra.id,fornecedor:compra.fornecedor,nf:compra.nf||'',porNome:eu()?nomeExibicao(eu()):''}); n++; });
  cache=null; return n;
};
window.estoqueApagarCompra=function(compraId){ const a=(state.estoqueMov||[]).length; state.estoqueMov=(state.estoqueMov||[]).filter(mv=>mv.compraId!==compraId); cache=null; return a-state.estoqueMov.length; };

// ---------------------------------------------------------------------------
// cadastro de material e ajuste de inventário
// ---------------------------------------------------------------------------
function categorias(){ return [...new Set(M.map(x=>x[1]).concat(materiais().map(m=>m.categoria||'')).filter(Boolean))].sort(); }
function abrirMaterial(id,nomeInicial,depois){
  const m=id?matPorId(id):null;
  const bg=modalPlat(`<h3 style="margin:0 0 10px">${m?'Editar material':'Novo material'}</h3>
    <form id="fMat">
    <label for="mtNome">Nome</label><input id="mtNome" required value="${esc(m?m.nome:(nomeInicial||''))}" placeholder="Ex.: Resina composta A2">
    <div class="row">
      <div><label for="mtCat">Categoria</label><input id="mtCat" list="mtCats" value="${esc(m?m.categoria:'')}" placeholder="Ex.: Dentística"><datalist id="mtCats">${categorias().map(c=>`<option value="${esc(c)}">`).join('')}</datalist></div>
      <div><label for="mtUn">Unidade de uso</label><select id="mtUn">${UNIDADES.map(([v,t])=>`<option value="${v}" ${(m?m.unidade:'un')===v?'selected':''}>${t}</option>`).join('')}</select></div>
    </div>
    <div class="row">
      <div><label for="mtEmb">Como é comprado (embalagem)</label><input id="mtEmb" value="${esc(m?m.embalagem||'':'')}" placeholder="Ex.: Seringa com 4 g"></div>
      <div><label for="mtPor">Quanto vem em cada embalagem</label><input id="mtPor" inputmode="decimal" value="${esc(String(m?m.porEmbalagem||1:1).replace('.',','))}" required></div>
    </div>
    <div class="row">
      <div><label for="mtMin">Estoque mínimo (na unidade de uso)</label><input id="mtMin" inputmode="decimal" value="${esc(String(m?m.minimo||0:0).replace('.',','))}"></div>
      ${m?`<div style="align-self:flex-end"><label class="chk-linha"><input type="checkbox" id="mtAtivo" ${m.ativo!==false?'checked':''}> Em uso (aparece nas listas)</label></div>`:''}
    </div>
    <p class="muted" style="font-size:12.5px;margin:8px 0 0">Exemplo: resina comprada em seringa de 4 g → unidade de uso "g" e 4 por embalagem. Na compra você informa quantas seringas; no atendimento, quantos gramas.</p>
    <div style="margin-top:14px;display:flex;gap:8px;justify-content:space-between;flex-wrap:wrap">${m&&!(state.estoqueMov||[]).some(x=>x.mid===m.id)?'<button type="button" class="btn-d" id="mtExc">Excluir</button>':'<span></span>'}<span><button type="button" class="btn-s" data-fechar>Cancelar</button> <button class="btn-p">Salvar</button></span></div>
    </form>`);
  const ex=bg.querySelector('#mtExc'); if(ex) ex.addEventListener('click',()=>customConfirm('Excluir este material? Ele sai também dos kits.',()=>{ state.materiais=state.materiais.filter(x=>x.id!==m.id); (state.kits||[]).forEach(k=>{ k.itens=k.itens.filter(i=>i.mid!==m.id); }); saveData(); bg.remove(); render(); }));
  bg.querySelector('#fMat').addEventListener('submit',ev=>{
    ev.preventDefault(); const q=s=>bg.querySelector(s);
    const d={nome:q('#mtNome').value.trim(),categoria:q('#mtCat').value.trim()||'Outros',unidade:q('#mtUn').value,embalagem:q('#mtEmb').value.trim(),porEmbalagem:num(q('#mtPor').value),minimo:Math.max(0,num(q('#mtMin').value))};
    if(!d.nome){ avisar('Informe o nome do material.'); return; }
    if(!(d.porEmbalagem>0)){ avisar('Informe quanto vem em cada embalagem (maior que zero).'); return; }
    if(materiais().some(x=>x.id!==(m&&m.id) && chaveNome(x.nome)===chaveNome(d.nome))){ avisar('Já existe um material com esse nome.'); return; }
    state.materiais=state.materiais||[];
    let alvo=m; if(m){ Object.assign(m,d); const at=q('#mtAtivo'); if(at) m.ativo=at.checked; } else { alvo=Object.assign({id:uid(),ativo:true},d); state.materiais.push(alvo); }
    cache=null; saveData(); bg.remove(); if(depois) depois(alvo); else render();
  });
}
window.estoqueNovoMaterial=(nome,depois)=>abrirMaterial(null,nome,depois);
function abrirAjuste(id){
  const m=matPorId(id); if(!m) return; const s=infoMat(id);
  const bg=modalPlat(`<h3 style="margin:0 0 4px">Ajustar estoque · ${esc(m.nome)}</h3>
    <p class="muted" style="margin:0 0 10px">Saldo no sistema: <strong>${esc(fmtQtd(s.saldo,m.unidade))}</strong></p>
    <form id="fAj">
    <label for="ajTipo">O que aconteceu</label>
    <select id="ajTipo"><option value="contagem">Contei o estoque (informar o saldo real)</option><option value="perda">Perda, vencimento ou quebra (dar baixa)</option><option value="entrada">Entrada sem compra (amostra, doação, saldo inicial)</option></select>
    <div class="row">
      <div><label for="ajQtd" id="ajQtdRot">Saldo real contado (${esc(m.unidade)})</label><input id="ajQtd" inputmode="decimal" required></div>
      <div id="ajCustoW" style="display:none"><label for="ajCusto">Custo por ${esc(m.unidade)} (opcional)</label><input id="ajCusto" inputmode="decimal" placeholder="0,00"></div>
    </div>
    <label for="ajObs">Observação</label><input id="ajObs" placeholder="Ex.: inventário do mês, lote vencido">
    <div style="margin-top:14px;text-align:right"><button type="button" class="btn-s" data-fechar>Cancelar</button> <button class="btn-p">Registrar</button></div>
    </form>`);
  const tipo=bg.querySelector('#ajTipo'), rot=bg.querySelector('#ajQtdRot'), cw=bg.querySelector('#ajCustoW');
  tipo.addEventListener('change',()=>{ rot.textContent=(tipo.value==='contagem'?'Saldo real contado':tipo.value==='perda'?'Quantidade perdida':'Quantidade que entrou')+` (${m.unidade})`; cw.style.display=tipo.value==='entrada'?'block':'none'; });
  bg.querySelector('#fAj').addEventListener('submit',ev=>{
    ev.preventDefault(); const q=num(bg.querySelector('#ajQtd').value); if(!(q>=0) || (tipo.value!=='contagem' && !(q>0))){ avisar('Informe a quantidade.'); return; }
    const base={id:uid(),mid:m.id,data:hojeISO(),em:new Date().toISOString(),obs:bg.querySelector('#ajObs').value.trim(),porNome:eu()?nomeExibicao(eu()):''};
    state.estoqueMov=state.estoqueMov||[];
    if(tipo.value==='contagem'){ const dif=r4(q-s.saldo); if(!dif){ bg.remove(); avisar('O saldo já está certo.'); return; } state.estoqueMov.push(Object.assign(base,{tipo:'ajuste',qtd:dif,motivo:'Contagem de estoque'})); }
    else if(tipo.value==='perda') state.estoqueMov.push(Object.assign(base,{tipo:'ajuste',qtd:-q,motivo:'Perda / vencimento'}));
    else state.estoqueMov.push(Object.assign(base,{tipo:'entrada',qtd:q,custoUnit:r4(Math.max(0,num(bg.querySelector('#ajCusto').value))),motivo:'Entrada sem compra'}));
    cache=null; saveData(); bg.remove(); render();
  });
}

// ---------------------------------------------------------------------------
// tela Estoque
// ---------------------------------------------------------------------------
let aba='saldo', busca='', filtroCat='', filtroVer='', kitSel=ID_CONSULTA, kitBusca='', movFiltro='', custoPer='mes', kitEdit=null;
function kpi(r,v,sub,cls){ return `<div class="pf-kpi${cls?' '+cls:''}"><span class="pf-kpi-rot">${r}</span><strong>${v}</strong>${sub?`<span class="pf-kpi-sub">${sub}</span>`:''}</div>`; }
window.estoqueTelaHtml=function(){
  if(!liberado()) return `<div class="card"><h2 style="margin-top:0">Estoque</h2><p>O controle de estoque faz parte do plano <strong>Completo</strong> e também pode ser contratado como módulo. Fale com o OdontoGestão para liberar.</p></div>`;
  if(!podeVer()) return `<div class="card"><h2 style="margin-top:0">Estoque</h2><p class="muted">Seu usuário não tem acesso ao estoque.</p></div>`;
  if(garantirBase()) saveData();
  const abas=[['saldo','📦 Materiais e saldo'],['mov','🔁 Movimentações'],['kits','🧰 Kits por procedimento']].concat(veCusto()?[['custos','💲 Custo por procedimento']]:[]);
  if(!abas.some(a=>a[0]===aba)) aba='saldo';
  const corpo=aba==='mov'?telaMov():aba==='kits'?telaKits():aba==='custos'?telaCustos():telaSaldo();
  return `<h2 style="margin:0 0 10px 0">Estoque</h2><div class="tabs">${abas.map(([id,t])=>`<button data-estaba="${id}" class="${aba===id?'active':''}">${t}</button>`).join('')}</div>${corpo}`;
};
function telaSaldo(){
  const lista=materiais().filter(m=>(!filtroCat||m.categoria===filtroCat) && (!busca||normTxt(m.nome).includes(normTxt(busca))) && (filtroVer!=='controle'||controlado(m.id)) && (filtroVer!=='repor'||abaixoMinimo().includes(m)));
  const ativos=materiais().filter(m=>m.ativo!==false), baixo=abaixoMinimo();
  const valor=r2(ativos.reduce((s,m)=>{ const i=infoMat(m.id); return s+Math.max(i.saldo,0)*i.custo; },0));
  const rank=m=>m.ativo===false?4:({'Zerado':0,'Abaixo do mínimo':1,'OK':2,'Sem movimento':3})[situacao(m)[0]];
  const ordem=(a,b)=>rank(a)-rank(b) || (a.categoria||'').localeCompare(b.categoria||'') || a.nome.localeCompare(b.nome);
  const temEntradas=(state.estoqueMov||[]).some(x=>x.tipo==='entrada');
  const fin=eu()&&permsDe(eu()).financeiro;
  return `<div class="card"><div class="pf-caixa">${kpi('Materiais cadastrados',ativos.length,'em uso')}${veCusto()?kpi('Valor em estoque',fmtMoney(valor),'pelo custo médio das compras'):''}${kpi('Abaixo do mínimo',baixo.length,baixo.length?'repor na próxima compra':'tudo em ordem',baixo.length?'ruim':'')}</div>
    ${!temEntradas?`<p class="est-dica">Para começar: lance as compras de material em <strong>Financeiro → Lançar despesa → Compra com itens</strong>, escolhendo "Material de consumo". Se já tem material na clínica, use <strong>Ajustar → Entrada sem compra</strong> para informar o saldo inicial.</p>`:''}
    <div class="est-filtros"><input type="search" id="estBusca" placeholder="Buscar material" value="${esc(busca)}" aria-label="Buscar material">
      <select id="estVer" aria-label="Mostrar"><option value="">Todos os materiais</option><option value="controle" ${filtroVer==='controle'?'selected':''}>Só os que têm movimento</option><option value="repor" ${filtroVer==='repor'?'selected':''}>Só os para repor</option></select>
      <select id="estCat" aria-label="Categoria"><option value="">Todas as categorias</option>${categorias().map(c=>`<option ${filtroCat===c?'selected':''}>${esc(c)}</option>`).join('')}</select>
      <span style="flex:1"></span>${fin?'<button class="btn-s" data-estcompra>Registrar compra</button>':''}${podeGerir()?'<button class="btn-p" data-estnovo>+ Novo material</button>':''}</div>
    <div class="overflow"><table class="est-t"><thead><tr><th>Material</th><th>Saldo</th><th>Mínimo</th>${veCusto()?'<th>Custo médio</th><th>Valor</th>':''}<th>Situação</th><th></th></tr></thead><tbody>
    ${lista.sort(ordem).map(m=>{ const i=infoMat(m.id), [st,cls]=situacao(m), por=+m.porEmbalagem||1;
      return `<tr class="${m.ativo===false?'est-inativo':''}"><td><strong>${esc(m.nome)}</strong><div class="muted" style="font-size:12px">${esc(m.categoria||'')}${m.embalagem?' · '+esc(m.embalagem):''}</div></td>
        <td style="white-space:nowrap">${esc(fmtQtd(i.saldo,m.unidade))}${por>1&&i.saldo>0?`<div class="muted" style="font-size:12px">≈ ${esc(fmtQtd(i.saldo/por))} emb.</div>`:''}</td>
        <td style="white-space:nowrap">${esc(fmtQtd(m.minimo||0,m.unidade))}</td>
        ${veCusto()?`<td style="white-space:nowrap">${i.custo?esc(fmtCusto(i.custo))+' / '+esc(m.unidade):'—'}</td><td style="white-space:nowrap">${i.custo&&i.saldo>0?esc(fmtMoney(i.saldo*i.custo)):'—'}</td>`:''}
        <td><span class="sit ${cls}">${m.ativo===false?'Fora de uso':st}</span></td>
        <td class="actions" style="white-space:nowrap">${podeGerir()?`<button class="btn-s peq" data-estaj="${m.id}">Ajustar</button> <button class="btn-s peq" data-ested="${m.id}">Editar</button>`:''}</td></tr>`; }).join('')||`<tr><td colspan="7" class="muted">Nenhum material encontrado.</td></tr>`}
    </tbody></table></div></div>`;
}
function rotOrigem(mv){
  if(mv.tipo==='entrada') return mv.compraId?'Compra · '+esc(mv.fornecedor||'')+(mv.nf?' · NF '+esc(mv.nf):''):esc(mv.motivo||'Entrada');
  if(mv.tipo==='saida') return 'Atendimento · '+esc(mv.pacienteNome||'')+(mv.procNome?' · '+esc(mv.procNome):'');
  return esc(mv.motivo||'Ajuste')+(mv.obs?' · '+esc(mv.obs):'');
}
function telaMov(){
  const l=(state.estoqueMov||[]).filter(mv=>!movFiltro||mv.mid===movFiltro).slice().sort((a,b)=>((b.data||'')+(b.em||'')).localeCompare((a.data||'')+(a.em||''))).slice(0,400);
  return `<div class="card"><div class="est-filtros"><select id="estMovMat" aria-label="Material"><option value="">Todos os materiais</option>${materiais().slice().sort((a,b)=>a.nome.localeCompare(b.nome)).map(m=>`<option value="${m.id}" ${movFiltro===m.id?'selected':''}>${esc(m.nome)}</option>`).join('')}</select></div>
    <div class="overflow"><table class="est-t"><thead><tr><th>Data</th><th>Tipo</th><th>Material</th><th>Quantidade</th>${veCusto()?'<th>Custo</th>':''}<th>Origem</th></tr></thead><tbody>
    ${l.map(mv=>{ const m=matPorId(mv.mid)||{nome:'(material excluído)',unidade:''}; const ent=mv.tipo==='entrada'||(mv.tipo==='ajuste'&&mv.qtd>0);
      return `<tr><td style="white-space:nowrap">${esc(fmtDataBR(mv.data))}</td><td><span class="sit ${ent?'sit-chegou':mv.tipo==='saida'?'sit-confirmado':'sit-nao_vem'}">${mv.tipo==='entrada'?'Entrada':mv.tipo==='saida'?'Saída':'Ajuste'}</span></td>
      <td>${esc(m.nome)}</td><td style="white-space:nowrap">${ent?'+':'−'}${esc(fmtQtd(Math.abs(mv.qtd),m.unidade))}</td>${veCusto()?`<td style="white-space:nowrap">${mv.custoUnit?esc(fmtCusto(Math.abs(mv.qtd)*mv.custoUnit)):'—'}</td>`:''}
      <td style="font-size:13px">${rotOrigem(mv)}${mv.porNome?`<div class="muted" style="font-size:11.5px">${esc(mv.porNome)}</div>`:''}</td></tr>`; }).join('')||`<tr><td colspan="6" class="muted">Nenhuma movimentação ainda.</td></tr>`}
    </tbody></table></div></div>`;
}
function custoKit(itens){ return r2((itens||[]).reduce((s,i)=>s+(+i.qtd||0)*infoMat(i.mid).custo,0)); }
function telaKits(){
  const procs=(state.procedimentos||[]).slice().sort((a,b)=>(a.especialidade||'').localeCompare(b.especialidade||'')||a.nome.localeCompare(b.nome));
  const vis=procs.filter(pr=>!kitBusca||normTxt(pr.nome+' '+pr.especialidade).includes(normTxt(kitBusca)));
  const grupos={}; vis.forEach(pr=>{ (grupos[pr.especialidade||'Outros']=grupos[pr.especialidade||'Outros']||[]).push(pr); });
  const k=kitDe(kitSel), pr=procs.find(x=>x.id===kitSel);
  if(!kitEdit || kitEdit.id!==kitSel) kitEdit={id:kitSel,itens:(k?k.itens:[]).map(i=>({mid:i.mid,qtd:i.qtd}))};
  const gerir=podeGerir(), ck=custoKit(kitEdit.itens);
  const item=x=>{ const kk=kitDe(x.id); const n=kk?kk.itens.length:0; return `<button class="est-kit-it ${kitSel===x.id?'active':''}" data-estkit="${x.id}"><span>${esc(x.nome)}</span><span class="muted">${n?n+' ite'+(n===1?'m':'ns'):'sem kit'}</span></button>`; };
  return `<div class="est-kits">
    <div class="card est-kits-lista"><input type="search" id="estKitBusca" placeholder="Buscar procedimento" value="${esc(kitBusca)}" aria-label="Buscar procedimento">
      ${item({id:ID_CONSULTA,nome:'Toda consulta (EPI e descartáveis)'})}
      ${Object.keys(grupos).map(g=>`<div class="est-kit-grupo">${esc(g)}</div>${grupos[g].map(item).join('')}`).join('')}</div>
    <div class="card est-kit-ed">
      <h3 style="margin:0 0 2px">${kitSel===ID_CONSULTA?'Toda consulta':esc(pr?pr.nome:'Procedimento')}</h3>
      <p class="muted" style="margin:0 0 10px;font-size:13px">${kitSel===ID_CONSULTA?'Sai uma vez em todo atendimento realizado (não sai em falta).':`Consumo médio por execução${pr&&pr.escopo==='arcada'?' <strong>por arcada</strong> (nas duas arcadas, dobra)':pr&&pr.escopo==='dente'?' por dente':''}. O dentista confere e ajusta na evolução.`}</p>
      <div class="overflow"><table class="est-t"><thead><tr><th>Material</th><th>Quantidade</th>${veCusto()?'<th>Custo</th>':''}<th></th></tr></thead><tbody>
      ${kitEdit.itens.map((i,ix)=>{ const m=matPorId(i.mid); if(!m) return ''; return `<tr><td>${esc(m.nome)}</td><td style="white-space:nowrap">${gerir?`<input data-kitq="${ix}" inputmode="decimal" value="${esc(String(i.qtd).replace('.',','))}" style="width:80px" aria-label="Quantidade de ${esc(m.nome)}">`:esc(fmtQtd(i.qtd))} ${esc(m.unidade)}</td>${veCusto()?`<td>${infoMat(m.id).custo?esc(fmtCusto(i.qtd*infoMat(m.id).custo)):'<span class="muted">sem compra</span>'}</td>`:''}<td>${gerir?`<button class="btn-icone peq btn-perigo" data-kitrm="${ix}" aria-label="Tirar ${esc(m.nome)}">${ICONES.lixo}</button>`:''}</td></tr>`; }).join('')||`<tr><td colspan="4" class="muted">Nenhum material neste kit.</td></tr>`}
      </tbody></table></div>
      ${gerir?`<select id="estKitAdd" style="max-width:360px;margin-top:8px">${opcoesMateriais('')}</select>`:''}
      ${veCusto()?`<div class="orc-resumo" style="margin-top:12px"><div><span>Custo estimado do kit</span><span>${fmtMoney(ck)}</span></div>${pr&&pr.valor?`<div><span>Valor do procedimento na tabela</span><span>${fmtMoney(pr.valor)}</span></div><div class="orc-total"><span>Material sobre o valor</span><span>${(ck/pr.valor*100).toLocaleString('pt-BR',{maximumFractionDigits:1})}%</span></div>`:''}</div><p class="muted" style="font-size:12px;margin:6px 0 0">Calculado pelo custo médio das compras já lançadas.</p>`:''}
      ${gerir?`<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn-p" data-kitsalvar>Salvar kit</button>${pr&&kitBasePara(pr.nome)?'<button class="btn-s" data-kitpadrao>Voltar ao kit sugerido</button>':''}</div>`:''}
    </div></div>`;
}
function periodo(){ const h=hojeISO(); if(custoPer==='mes') return [h.slice(0,8)+'01',h]; if(custoPer==='3m'){ const d=new Date(h+'T12:00:00'); d.setMonth(d.getMonth()-2); d.setDate(1); return [d.toISOString().slice(0,10),h]; } return [h.slice(0,4)+'-01-01',h]; }
function telaCustos(){
  const [ini,fim]=periodo();
  const sai=(state.estoqueMov||[]).filter(mv=>mv.tipo==='saida' && mv.data>=ini && mv.data<=fim);
  const porProc={}, porMat={};
  sai.forEach(mv=>{ const c=(+mv.qtd||0)*(+mv.custoUnit||0); const k=mv.procId||'avulso';
    const x=porProc[k]||(porProc[k]={nome:mv.procNome||nomeOrigem(k)||'Incluídos à parte',total:0,evols:new Set()}); x.total+=c; x.evols.add(mv.evolId);
    const y=porMat[mv.mid]||(porMat[mv.mid]={total:0,qtd:0}); y.total+=c; y.qtd+=(+mv.qtd||0); });
  const tot=r2(sai.reduce((s,mv)=>s+(+mv.qtd||0)*(+mv.custoUnit||0),0));
  const atend=new Set(sai.map(mv=>mv.evolId)).size;
  const lp=Object.keys(porProc).map(k=>{ const x=porProc[k], pr=(state.procedimentos||[]).find(p=>p.id===k), n=x.evols.size, med=n?x.total/n:0; return {k,nome:x.nome,n,total:x.total,med,valor:pr?+pr.valor||0:0}; }).sort((a,b)=>b.total-a.total);
  const lm=Object.keys(porMat).map(id=>({m:matPorId(id),...porMat[id]})).filter(x=>x.m).sort((a,b)=>b.total-a.total).slice(0,10);
  const compras=(state.estoqueMov||[]).filter(mv=>mv.tipo==='entrada'&&mv.data>=ini&&mv.data<=fim).reduce((s,mv)=>s+(+mv.qtd||0)*(+mv.custoUnit||0),0);
  return `<div class="card"><div class="est-filtros"><div class="seg" role="group" aria-label="Período">${[['mes','Este mês'],['3m','Últimos 3 meses'],['ano','Este ano']].map(([v,t])=>`<button data-estper="${v}" class="${custoPer===v?'active':''}">${t}</button>`).join('')}</div></div>
    <div class="pf-caixa">${kpi('Material usado nos atendimentos',fmtMoney(tot),atend+' atendimento'+(atend===1?'':'s'))}${kpi('Custo médio por atendimento',fmtMoney(atend?tot/atend:0),'material de consumo')}${kpi('Material comprado',fmtMoney(compras),'entradas no estoque no período')}</div>
    <h3 style="margin:16px 0 6px">Por procedimento</h3>
    <div class="overflow"><table class="est-t"><thead><tr><th>Procedimento</th><th>Execuções</th><th>Custo médio</th><th>Valor na tabela</th><th>Material / valor</th><th>Total</th></tr></thead><tbody>
    ${lp.map(x=>`<tr><td>${esc(x.nome)}</td><td>${x.n}</td><td>${esc(fmtMoney(x.med))}</td><td>${x.valor?esc(fmtMoney(x.valor)):'—'}</td><td>${x.valor?(x.med/x.valor*100).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%':'—'}</td><td>${esc(fmtMoney(x.total))}</td></tr>`).join('')||'<tr><td colspan="6" class="muted">Nenhuma baixa de material no período.</td></tr>'}
    </tbody></table></div>
    ${lm.length?`<h3 style="margin:16px 0 6px">Materiais que mais pesaram</h3><div class="overflow"><table class="est-t"><thead><tr><th>Material</th><th>Usado</th><th>Custo</th></tr></thead><tbody>${lm.map(x=>`<tr><td>${esc(x.m.nome)}</td><td>${esc(fmtQtd(x.qtd,x.m.unidade))}</td><td>${esc(fmtMoney(x.total))}</td></tr>`).join('')}</tbody></table></div>`:''}
  </div>`;
}
window.estoqueLigar=function(){
  document.querySelectorAll('[data-estaba]').forEach(b=>b.addEventListener('click',()=>{ aba=b.getAttribute('data-estaba'); render(); }));
  const bq=document.getElementById('estBusca'); if(bq) bq.addEventListener('input',()=>{ busca=bq.value; const pos=bq.selectionStart; render(); const n=document.getElementById('estBusca'); if(n){ n.focus(); try{ n.setSelectionRange(pos,pos); }catch(e){} } });
  const vv=document.getElementById('estVer'); if(vv) vv.addEventListener('change',()=>{ filtroVer=vv.value; render(); });
  const ct=document.getElementById('estCat'); if(ct) ct.addEventListener('change',()=>{ filtroCat=ct.value; render(); });
  document.querySelectorAll('[data-estnovo]').forEach(b=>b.addEventListener('click',()=>abrirMaterial(null)));
  document.querySelectorAll('[data-ested]').forEach(b=>b.addEventListener('click',()=>abrirMaterial(b.getAttribute('data-ested'))));
  document.querySelectorAll('[data-estaj]').forEach(b=>b.addEventListener('click',()=>abrirAjuste(b.getAttribute('data-estaj'))));
  document.querySelectorAll('[data-estcompra]').forEach(b=>b.addEventListener('click',()=>{ currentTab='financeiro'; financeiroSubTab='lancardespesa'; despModo='compra'; compraItens=[{nome:'',qtd:1,unit:'',destino:'estoque',mid:'',patrimonio:false,vida:10}]; render(); }));
  const mm=document.getElementById('estMovMat'); if(mm) mm.addEventListener('change',()=>{ movFiltro=mm.value; render(); });
  document.querySelectorAll('[data-estper]').forEach(b=>b.addEventListener('click',()=>{ custoPer=b.getAttribute('data-estper'); render(); }));
  // kits
  const kb=document.getElementById('estKitBusca'); if(kb) kb.addEventListener('input',()=>{ kitBusca=kb.value; const pos=kb.selectionStart; render(); const n=document.getElementById('estKitBusca'); if(n){ n.focus(); try{ n.setSelectionRange(pos,pos); }catch(e){} } });
  document.querySelectorAll('[data-estkit]').forEach(b=>b.addEventListener('click',()=>{ kitSel=b.getAttribute('data-estkit'); kitEdit=null; render(); }));
  document.querySelectorAll('[data-kitq]').forEach(inp=>inp.addEventListener('input',()=>{ const it=kitEdit&&kitEdit.itens[+inp.getAttribute('data-kitq')]; if(it) it.qtd=Math.max(0,num(inp.value)); }));
  document.querySelectorAll('[data-kitrm]').forEach(b=>b.addEventListener('click',()=>{ kitEdit.itens.splice(+b.getAttribute('data-kitrm'),1); render(); }));
  const ka=document.getElementById('estKitAdd'); if(ka) ka.addEventListener('change',()=>{ if(!ka.value) return; if(!kitEdit.itens.some(i=>i.mid===ka.value)) kitEdit.itens.push({mid:ka.value,qtd:1}); render(); });
  document.querySelectorAll('[data-kitpadrao]').forEach(b=>b.addEventListener('click',()=>{ const pr=(state.procedimentos||[]).find(x=>x.id===kitSel); const base=pr&&kitBasePara(pr.nome); if(base){ kitEdit.itens=base.filter(([c])=>matPorId(idBase(c))).map(([c,q])=>({mid:idBase(c),qtd:q})); render(); } }));
  document.querySelectorAll('[data-kitsalvar]').forEach(b=>b.addEventListener('click',()=>{
    document.querySelectorAll('[data-kitq]').forEach(inp=>{ const it=kitEdit.itens[+inp.getAttribute('data-kitq')]; if(it) it.qtd=Math.max(0,num(inp.value)); });
    state.kits=state.kits||[]; const itens=kitEdit.itens.filter(i=>i.qtd>0).map(i=>({mid:i.mid,qtd:r4(i.qtd)}));
    const k=kitDe(kitSel); if(k){ k.itens=itens; delete k.base; } else state.kits.push({id:kitSel,itens});
    kitEdit=null; saveData(); render(); avisar('Kit salvo. As próximas evoluções já vêm com ele.'); }));
};

// ---------------------------------------------------------------------------
// dados fictícios (ambiente de teste): compra de material, entradas e baixas dos atendimentos já feitos
// ---------------------------------------------------------------------------
const PRECO_FIC={luva:42,mascara:18,gorro:22,babador:28,sugador:16,copo:9,barreira:60,envelope:55,gaze:38,rolete:7,anest:150,agulha:45,acido:14,adesivo:95,resina:65,microbrush:22,tira_poli:12,lixa:48,disco:120,cunha:25,civ:85,isolamento:45,lima:38,hipoclorito:12,edta:18,guta:28,papel:22,cim_endo:120,seringa_irr:35,ponta_irr:30,prov:25,fio_sutura:110,lamina:45,soro:6,pasta_prof:18,robinson:20,fluor:28,clorex:35,braquete:95,tubo:60,fio_orto:45,ligadura:30,resina_orto:70,primer_orto:85,alginato:32,gesso:15,filme_rx:180};
window.estoqueFicticios=function(dia){
  if(!liberado()) return;
  garantirBase();
  state.compras=state.compras||[]; state.estoqueMov=state.estoqueMov||[]; state.fluxoFinanceiro=state.fluxoFinanceiro||[];
  if(state.compras.some(c=>c.id==='fic-cpest')) return;
  const data=dia(-40), itens=[];
  Object.keys(PRECO_FIC).forEach(c=>{ const m=matPorId(idBase(c)); if(!m) return; const qtd=['luva','gaze','anest','rolete','sugador','babador','copo','mascara','gorro','envelope','ligadura','braquete','resina','guta','papel'].includes(c)?3:2;
    itens.push({nome:m.nome,qtd,unit:PRECO_FIC[c],patrimonio:false,vida:10,destino:'estoque',mid:m.id}); });
  const total=r2(itens.reduce((s,it)=>s+it.qtd*it.unit,0));
  const compra={id:'fic-cpest',ficticio:true,data,fornecedor:'Dental fictícia',nf:'0001',tipoNome:'Material odontológico',categoria:'Materiais e Insumos',itens,total,forma:'Boleto',condicao:'avista',parcelas:1,criadaEm:new Date().toISOString()};
  state.compras.push(compra);
  state.fluxoFinanceiro.push({id:'fic-cpest-p1',ficticio:true,tipo:'despesa',categoria:'Materiais e Insumos',fornecedor:'Dental fictícia',label:'Material odontológico · à vista',valor:total,vencimento:data,confirmado:true,dataPagamento:data,forma:'Boleto',compraId:compra.id});
  window.estoqueEntradasDaCompra(compra,itens);
  state.estoqueMov.forEach(mv=>{ if(mv.compraId==='fic-cpest') mv.ficticio=true; });
  cache=null;
  // baixa dos atendimentos fictícios já confirmados
  (state.patients||[]).filter(p=>p.ficticio).forEach(p=>(p.evolucao||[]).filter(e=>e.confirmado&&!e.falta&&!e.materiais).forEach(e=>{
    delete rascunho[e.id]; const antes=state.estoqueMov.length; window.estoqueBaixarEvol(p,e);
    state.estoqueMov.slice(antes).forEach(mv=>{ mv.ficticio=true; mv.data=e.data; mv.porNome=e.confirmadoPorNome||''; }); }));
  cache=null;
};
window.estoqueRemoverFicticios=function(){
  state.estoqueMov=(state.estoqueMov||[]).filter(mv=>!mv.ficticio);
  state.compras=(state.compras||[]).filter(c=>!c.ficticio);
  cache=null;
};
})();
