/* =========================================================
   Onion SPA - i18n CA
   Archivo: src/i18n/ca.js

   Responsabilidades:
   - diccionari base en català
   - textos globals de la SPA
   - labels de navegació
   - accions comunes
   - auth / estats / errors
   - suport inicial per a toast
   - estructura escalable per namespaces
========================================================= */

const ca = {
  meta: {
    appName: "Onion Support",
    language: "Català",
    locale: "ca-ES",
  },

  common: {
    ok: "D'acord",
    yes: "Sí",
    no: "No",
    save: "Desar",
    cancel: "Cancel·lar",
    close: "Tancar",
    accept: "Acceptar",
    continue: "Continuar",
    back: "Tornar",
    retry: "Reintentar",
    refresh: "Actualitzar",
    reload: "Recarregar",
    edit: "Editar",
    delete: "Eliminar",
    remove: "Treure",
    add: "Afegir",
    create: "Crear",
    search: "Cercar",
    filter: "Filtrar",
    clear: "Netejar",
    loading: "Carregant",
    sending: "Enviant",
    processing: "Processant",
    selected: "Seleccionat",
    all: "Tots",
    none: "Cap",
    status: "Estat",
    actions: "Accions",
    name: "Nom",
    email: "Correu electrònic",
    phone: "Telèfon",
    date: "Data",
    hour: "Hora",
    description: "Descripció",
    details: "Detalls",
    viewMore: "Veure més",
    viewLess: "Veure menys",
    enabled: "Activat",
    disabled: "Desactivat",
    language: "Idioma",
    theme: "Tema",
    user: "Usuari",
    role: "Rol",
    unknown: "Desconegut",
    notAvailable: "No disponible",
    noResults: "No s'han trobat resultats",
    noData: "No hi ha dades disponibles",
    welcome: "Benvingut",
    goodbye: "Fins aviat",
  },

  app: {
    title: "Onion Support",
    subtitle: "Panell de suport",
    loading: "Iniciant aplicació...",
    booting: "Preparant entorn...",
    ready: "Aplicació llesta",
    offline: "Sense connexió",
    online: "Connexió restablerta",
    notFound: {
      title: "Pàgina no trobada",
      message: "La ruta que intentes obrir no existeix o ja no està disponible.",
      action: "Tornar a l'inici",
    },
    forbidden: {
      title: "Accés denegat",
      message: "No tens permisos per accedir a aquesta secció.",
    },
  },

  nav: {
    home: "Inici",
    dashboard: "Panell",
    incidents: "Incidències",
    tickets: "Tiquets",
    invoices: "Factures",
    users: "Usuaris",
    clients: "Clients",
    account: "Compte",
    settings: "Configuració",
    login: "Accés",
    logout: "Tancar sessió",
  },

  topbar: {
    searchPlaceholder: "Cercar a l'aplicació...",
    openMenu: "Obrir menú",
    closeMenu: "Tancar menú",
    openUserMenu: "Obrir menú d'usuari",
    changeTheme: "Canviar tema",
    changeLanguage: "Canviar idioma",
  },

  sidebar: {
    collapse: "Contraure barra lateral",
    expand: "Expandir barra lateral",
  },

  home: {
    title: "Inici",
    welcome: "Benvingut a Onion Support",
    description: "El teu panell de gestió i suport està llest.",
    summary: {
      title: "Resum del sistema",
      apiBase: "API Base",
      currentRoute: "Ruta actual",
      currentTheme: "Tema actual",
      currentLanguage: "Idioma actual",
      authenticated: "Sessió autenticada",
    },
    actions: {
      toggleTheme: "Canviar tema",
      logState: "Mostrar estat a la consola",
    },
  },

  auth: {
    login: {
      title: "Iniciar sessió",
      subtitle: "Accedeix al teu compte per continuar",
      username: "Usuari",
      email: "Correu electrònic",
      password: "Contrasenya",
      remember: "Recorda'm",
      submit: "Entrar",
      forgotPassword: "He oblidat la contrasenya",
      noAccount: "No tens compte",
    },
    logout: {
      action: "Tancar sessió",
      success: "Sessió tancada correctament",
    },
    session: {
      expired: "La teva sessió ha expirat. Torna a iniciar sessió.",
      invalid: "La sessió no és vàlida.",
      required: "Has d'iniciar sessió per continuar.",
      restored: "Sessió restaurada correctament",
    },
    user: {
      guest: "Convidat",
    },
  },

  account: {
    title: "Compte",
    profile: "Perfil",
    security: "Seguretat",
    preferences: "Preferències",
  },

  settings: {
    title: "Configuració",
    appearance: "Aparença",
    notifications: "Notificacions",
    language: "Idioma",
    system: "Sistema",
    theme: {
      label: "Tema",
      dark: "Fosc",
      light: "Clar",
      auto: "Automàtic",
      changed: "Tema actualitzat",
    },
    languageChanged: "Idioma actualitzat",
  },

  clients: {
    title: "Clients",
    empty: "No hi ha clients disponibles",
  },

  users: {
    title: "Usuaris",
    empty: "No hi ha usuaris disponibles",
  },

  invoices: {
    title: "Factures",
    empty: "No hi ha factures disponibles",
  },

  incidents: {
    title: "Incidències",
    empty: "No hi ha incidències disponibles",
  },

  search: {
    placeholder: "Cercar...",
    empty: "Sense resultats",
    sections: {
      navigation: "Navegació",
      results: "Resultats",
    },
    items: {
      home: "Inici",
      incidents: "Incidències",
      invoices: "Factures",
      users: "Usuaris",
      clients: "Clients",
      account: "Compte",
      settings: "Configuració",
    },
  },

  theme: {
    light: "Clar",
    dark: "Fosc",
    changedToLight: "Tema canviat a clar",
    changedToDark: "Tema canviat a fosc",
  },

  toast: {
    close: "Tancar notificació",
    types: {
      success: "Èxit",
      error: "Error",
      warning: "Avís",
      info: "Informació",
      loading: "Carregant",
    },
    generic: {
      success: "Acció completada correctament",
      error: "S'ha produït un error inesperat",
      warning: "Revisa la informació abans de continuar",
      info: "Hi ha informació nova disponible",
      loading: "Processant sol·licitud...",
    },
    actions: {
      dismiss: "Descartar",
      undo: "Desfer",
      retry: "Reintentar",
    },
  },

  feedback: {
    success: {
      saved: "Canvis desats correctament",
      updated: "Dades actualitzades correctament",
      created: "Element creat correctament",
      deleted: "Element eliminat correctament",
      sent: "Enviament completat correctament",
    },
    error: {
      generic: "S'ha produït un error inesperat",
      network: "Error de xarxa. Comprova la connexió.",
      server: "El servidor no ha respost correctament",
      timeout: "L'operació ha trigat massa",
      forbidden: "No tens permisos per fer aquesta acció",
      unauthorized: "No autoritzat",
      notFound: "No s'ha trobat el recurs sol·licitat",
      validation: "Revisa els camps marcats",
      saveFailed: "No s'han pogut desar els canvis",
      loadFailed: "No s'ha pogut carregar la informació",
    },
  },

  forms: {
    required: "Aquest camp és obligatori",
    invalidEmail: "Introdueix una adreça de correu electrònic vàlida",
    invalidPhone: "Introdueix un telèfon vàlid",
    minLength: "Ha de tenir com a mínim {min} caràcters",
    maxLength: "No pot superar els {max} caràcters",
    passwordMismatch: "Les contrasenyes no coincideixen",
    invalidFormat: "Format no vàlid",
  },

  validation: {
    required: "Camp obligatori",
    invalid: "Valor no vàlid",
    tooShort: "El valor és massa curt",
    tooLong: "El valor és massa llarg",
  },

  table: {
    empty: "No hi ha registres disponibles",
    loading: "Carregant taula...",
    columns: "Columnes",
    pagination: {
      previous: "Anterior",
      next: "Següent",
      page: "Pàgina",
      of: "de",
    },
  },

  status: {
    active: "Actiu",
    inactive: "Inactiu",
    pending: "Pendent",
    resolved: "Resolt",
    open: "Obert",
    closed: "Tancat",
    success: "Correcte",
    error: "Error",
    warning: "Avís",
    info: "Informació",
  },

  dates: {
    today: "Avui",
    yesterday: "Ahir",
    tomorrow: "Demà",
  },

  aria: {
    close: "Tancar",
    open: "Obrir",
    menu: "Menú",
    navigation: "Navegació principal",
    notifications: "Notificacions",
    userMenu: "Menú d'usuari",
  },
};

export default ca;
