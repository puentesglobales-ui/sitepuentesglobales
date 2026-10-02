/**
 * Diccionario propio de las profesiones más buscadas por los candidatos, con los
 * nombres que usan las ofertas de cada país. Tiene prioridad sobre ESCO, que en
 * algunos casos elige mal (en ESCO, "enfermero/enfermera" es el nombre en español
 * de "phlebotomist", y "limpieza" lleva a "toilet attendant").
 *
 * Para agregar una profesión: sumar una entrada con todas las formas en español en
 * `claves` (sin tildes ni mayúsculas no hace falta: se normaliza) y los términos que
 * aparecen en los títulos de las ofertas de cada idioma, del más común al menos común.
 */
export const PROFESIONES = [
  {
    titulo: 'enfermero/enfermera',
    claves: ['enfermera', 'enfermero', 'enfermeria', 'licenciada en enfermeria', 'licenciado en enfermeria'],
    terminos: {
      es: ['enfermera', 'enfermero', 'enfermería'],
      en: ['nurse', 'registered nurse', 'staff nurse', 'nursing'],
      de: ['Pflegefachkraft', 'Krankenpfleger', 'Krankenschwester', 'Pflegefachfrau', 'Pflegefachmann'],
      nl: ['verpleegkundige'],
      fr: ['infirmier', 'infirmière'],
      it: ['infermiere', 'infermiera'],
      pl: ['pielęgniarka', 'pielęgniarz']
    }
  },
  {
    titulo: 'cuidador/cuidadora de personas mayores',
    claves: ['cuidadora', 'cuidador', 'cuidadora de ancianos', 'cuidador de ancianos', 'cuidadora de adultos mayores', 'cuidador de personas mayores', 'cuidadora de personas mayores', 'auxiliar de geriatria', 'geriatria'],
    terminos: {
      es: ['cuidadora', 'cuidador', 'auxiliar de geriatría', 'gerocultor'],
      en: ['care worker', 'carer', 'care assistant', 'support worker', 'caregiver'],
      de: ['Altenpfleger', 'Altenpflegehelfer', 'Pflegehelfer', 'Betreuungskraft', 'Pflegeassistent'],
      nl: ['verzorgende', 'zorgmedewerker', 'helpende zorg'],
      fr: ['aide-soignant', 'auxiliaire de vie', 'aide à domicile'],
      it: ['badante', 'operatore socio sanitario', 'OSS'],
      pl: ['opiekunka', 'opiekun osób starszych']
    }
  },
  {
    titulo: 'chofer/conductor',
    claves: ['chofer', 'chofer de camion', 'camionero', 'conductor', 'conductora', 'conductor de camion', 'transportista', 'repartidor', 'repartidora'],
    terminos: {
      es: ['conductor', 'chófer', 'camionero', 'repartidor'],
      en: ['driver', 'HGV driver', 'delivery driver', 'truck driver', 'van driver'],
      de: ['Fahrer', 'Berufskraftfahrer', 'LKW-Fahrer', 'Kraftfahrer', 'Auslieferungsfahrer'],
      nl: ['chauffeur', 'vrachtwagenchauffeur', 'bezorger'],
      fr: ['chauffeur', 'conducteur', 'chauffeur-livreur', 'chauffeur poids lourd'],
      it: ['autista', 'camionista', 'corriere'],
      pl: ['kierowca']
    }
  },
  {
    titulo: 'limpiador/limpiadora',
    claves: ['limpieza', 'limpiador', 'limpiadora', 'personal de limpieza', 'operario de limpieza', 'operaria de limpieza', 'camarera de piso', 'camarera de pisos'],
    terminos: {
      es: ['limpiador', 'limpiadora', 'limpieza', 'camarera de pisos'],
      en: ['cleaner', 'cleaning operative', 'housekeeper', 'room attendant'],
      de: ['Reinigungskraft', 'Gebäudereiniger', 'Zimmermädchen', 'Raumpfleger'],
      nl: ['schoonmaker', 'schoonmaakmedewerker', 'huishoudelijk medewerker'],
      fr: ['agent d\'entretien', 'agent de nettoyage', 'femme de chambre'],
      it: ['addetto alle pulizie', 'cameriera ai piani'],
      pl: ['sprzątaczka', 'pracownik sprzątający', 'pokojówka']
    }
  },
  {
    titulo: 'programador/desarrollador de software',
    claves: ['programador', 'programadora', 'desarrollador', 'desarrolladora', 'desarrollador de software', 'developer', 'ingeniero de software', 'ingeniera de software', 'programador web', 'desarrollador web'],
    terminos: {
      es: ['programador', 'desarrollador', 'developer'],
      en: ['software developer', 'software engineer', 'developer', 'programmer'],
      de: ['Softwareentwickler', 'Entwickler', 'Programmierer', 'Software Engineer'],
      nl: ['softwareontwikkelaar', 'developer', 'programmeur'],
      fr: ['développeur', 'ingénieur logiciel', 'développeuse'],
      it: ['sviluppatore', 'programmatore', 'software engineer'],
      pl: ['programista', 'developer']
    }
  },
  {
    titulo: 'electricista',
    claves: ['electricista', 'tecnico electricista', 'instalador electricista'],
    terminos: {
      es: ['electricista'],
      en: ['electrician', 'electrical engineer'],
      de: ['Elektriker', 'Elektroniker', 'Elektroinstallateur'],
      nl: ['elektricien', 'elektromonteur'],
      fr: ['électricien'],
      it: ['elettricista'],
      pl: ['elektryk']
    }
  },
  {
    titulo: 'médico/médica',
    claves: ['medico', 'medica', 'doctor', 'doctora', 'medico general', 'medica general'],
    terminos: {
      es: ['médico', 'médica', 'facultativo'],
      en: ['doctor', 'physician', 'GP', 'medical officer'],
      de: ['Arzt', 'Ärztin', 'Assistenzarzt', 'Facharzt'],
      nl: ['arts', 'huisarts', 'basisarts'],
      fr: ['médecin'],
      it: ['medico'],
      pl: ['lekarz']
    }
  },
  {
    titulo: 'mecánico/mecánica',
    claves: ['mecanico', 'mecanica', 'mecanico automotriz', 'mecanico de autos'],
    terminos: {
      es: ['mecánico', 'mecánica'],
      en: ['mechanic', 'vehicle technician', 'motor mechanic'],
      de: ['Mechaniker', 'Kfz-Mechatroniker', 'Mechatroniker'],
      nl: ['monteur', 'automonteur', 'mechanicus'],
      fr: ['mécanicien'],
      it: ['meccanico'],
      pl: ['mechanik']
    }
  },
  {
    titulo: 'albañil / obrero de la construcción',
    claves: ['albanil', 'obrero', 'obrero de la construccion', 'peon de construccion', 'construccion'],
    terminos: {
      es: ['albañil', 'peón de construcción', 'oficial de obra'],
      en: ['construction worker', 'bricklayer', 'labourer', 'groundworker'],
      de: ['Maurer', 'Bauhelfer', 'Bauarbeiter', 'Hochbaufacharbeiter'],
      nl: ['metselaar', 'bouwvakker', 'grondwerker'],
      fr: ['maçon', 'ouvrier du bâtiment', 'manœuvre'],
      it: ['muratore', 'manovale', 'operaio edile'],
      pl: ['murarz', 'pracownik budowlany']
    }
  },
  {
    titulo: 'plomero/fontanero',
    claves: ['plomero', 'fontanero', 'gasista', 'plomeria', 'fontaneria'],
    terminos: {
      es: ['fontanero', 'plomero'],
      en: ['plumber', 'heating engineer'],
      de: ['Installateur', 'Anlagenmechaniker SHK', 'Klempner'],
      nl: ['loodgieter', 'installatiemonteur'],
      fr: ['plombier', 'chauffagiste'],
      it: ['idraulico'],
      pl: ['hydraulik']
    }
  },
  {
    titulo: 'operario/operaria de almacén',
    claves: ['almacen', 'operario de almacen', 'operaria de almacen', 'mozo de almacen', 'deposito', 'logistica', 'preparador de pedidos', 'carretillero', 'autoelevadorista'],
    terminos: {
      es: ['mozo de almacén', 'operario de almacén', 'preparador de pedidos', 'carretillero'],
      en: ['warehouse operative', 'warehouse worker', 'picker', 'forklift driver'],
      de: ['Lagerhelfer', 'Lagerist', 'Kommissionierer', 'Staplerfahrer', 'Fachkraft für Lagerlogistik'],
      nl: ['magazijnmedewerker', 'orderpicker', 'heftruckchauffeur'],
      fr: ['préparateur de commandes', 'cariste', 'magasinier'],
      it: ['magazziniere', 'carrellista'],
      pl: ['magazynier', 'operator wózka widłowego']
    }
  },
  {
    titulo: 'recepcionista',
    claves: ['recepcionista', 'recepcion', 'recepcionista de hotel'],
    terminos: {
      es: ['recepcionista'],
      en: ['receptionist', 'front desk'],
      de: ['Rezeptionist', 'Empfangsmitarbeiter', 'Rezeption'],
      nl: ['receptionist', 'receptioniste'],
      fr: ['réceptionniste'],
      it: ['receptionist', 'addetto al ricevimento'],
      pl: ['recepcjonista', 'recepcjonistka']
    }
  },
  {
    titulo: 'vendedor/vendedora',
    claves: ['vendedor', 'vendedora', 'dependiente', 'dependienta', 'cajero', 'cajera', 'comercio', 'atencion al cliente'],
    terminos: {
      es: ['dependiente', 'vendedor', 'cajero', 'atención al cliente'],
      en: ['sales assistant', 'retail assistant', 'cashier', 'customer service'],
      de: ['Verkäufer', 'Verkaufsberater', 'Kassierer', 'Kundenservice'],
      nl: ['verkoper', 'verkoopmedewerker', 'kassamedewerker', 'klantenservice'],
      fr: ['vendeur', 'conseiller de vente', 'caissier'],
      it: ['commesso', 'addetto vendite', 'cassiere'],
      pl: ['sprzedawca', 'kasjer']
    }
  },
  {
    titulo: 'trabajador/trabajadora agrícola',
    claves: ['agricultura', 'peon agricola', 'jornalero', 'jornalera', 'recolector', 'recolectora', 'temporero', 'temporera', 'trabajador agricola'],
    terminos: {
      es: ['peón agrícola', 'recolector', 'temporero'],
      en: ['farm worker', 'agricultural worker', 'fruit picker'],
      de: ['Erntehelfer', 'Landarbeiter', 'Saisonarbeitskraft'],
      nl: ['oogstmedewerker', 'agrarisch medewerker', 'seizoenswerker'],
      fr: ['ouvrier agricole', 'saisonnier agricole', 'cueilleur'],
      it: ['bracciante agricolo', 'operaio agricolo'],
      pl: ['pracownik rolny', 'zbieracz']
    }
  },
  {
    titulo: 'fisioterapeuta',
    claves: ['fisioterapeuta', 'kinesiologo', 'kinesiologa', 'kinesiologia', 'fisioterapia'],
    terminos: {
      es: ['fisioterapeuta'],
      en: ['physiotherapist', 'physical therapist'],
      de: ['Physiotherapeut', 'Physiotherapeutin'],
      nl: ['fysiotherapeut'],
      fr: ['kinésithérapeute'],
      it: ['fisioterapista'],
      pl: ['fizjoterapeuta']
    }
  }
];

import { normalizar } from './destinos.js';

const INDICE = new Map();
for (const p of PROFESIONES) for (const c of p.claves) INDICE.set(normalizar(c), p);

export function buscarEnDiccionario(consulta) {
  return INDICE.get(normalizar(consulta)) || null;
}
