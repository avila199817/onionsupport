/* =========================================================
   Onion SPA - i18n ES
   Archivo: src/i18n/es.js

   Responsabilidades:
   - diccionario base en español
   - textos globales de la SPA
   - labels de navegación
   - acciones comunes
   - auth / estados / errores
   - soporte inicial para toast
   - estructura escalable por namespaces
========================================================= */

const es = {
  meta: {
    appName: "Onion Support",
    language: "Español",
    locale: "es-ES",
  },

  common: {
    ok: "OK",
    yes: "Sí",
    no: "No",
    save: "Guardar",
    cancel: "Cancelar",
    close: "Cerrar",
    accept: "Aceptar",
    continue: "Continuar",
    back: "Volver",
    retry: "Reintentar",
    refresh: "Actualizar",
    reload: "Recargar",
    edit: "Editar",
    delete: "Eliminar",
    remove: "Quitar",
    add: "Añadir",
    create: "Crear",
    search: "Buscar",
    filter: "Filtrar",
    clear: "Limpiar",
    loading: "Cargando",
    sending: "Enviando",
    processing: "Procesando",
    selected: "Seleccionado",
    all: "Todos",
    none: "Ninguno",
    status: "Estado",
    actions: "Acciones",
    name: "Nombre",
    email: "Correo electrónico",
    phone: "Teléfono",
    date: "Fecha",
    hour: "Hora",
    description: "Descripción",
    details: "Detalles",
    viewMore: "Ver más",
    viewLess: "Ver menos",
    enabled: "Activado",
    disabled: "Desactivado",
    language: "Idioma",
    theme: "Tema",
    user: "Usuario",
    role: "Rol",
    unknown: "Desconocido",
    notAvailable: "No disponible",
    noResults: "No se han encontrado resultados",
    noData: "No hay datos disponibles",
    welcome: "Bienvenido",
    goodbye: "Hasta pronto",
  },

  app: {
    title: "Onion Support",
    subtitle: "Panel de soporte",
    loading: "Iniciando aplicación...",
    booting: "Preparando entorno...",
    ready: "Aplicación lista",
    offline: "Sin conexión",
    online: "Conexión restablecida",
    notFound: {
      title: "Página no encontrada",
      message: "La ruta que intentas abrir no existe o ya no está disponible.",
      action: "Volver al inicio",
    },
    forbidden: {
      title: "Acceso denegado",
      message: "No tienes permisos para acceder a esta sección.",
    },
  },

  nav: {
    home: "Inicio",
    dashboard: "Panel",
    incidents: "Incidencias",
    tickets: "Tickets",
    invoices: "Facturas",
    users: "Usuarios",
    clients: "Clientes",
    account: "Cuenta",
    settings: "Ajustes",
    login: "Acceso",
    logout: "Cerrar sesión",
  },

  topbar: {
    searchPlaceholder: "Buscar en la aplicación...",
    openMenu: "Abrir menú",
    closeMenu: "Cerrar menú",
    openUserMenu: "Abrir menú de usuario",
    changeTheme: "Cambiar tema",
    changeLanguage: "Cambiar idioma",
  },

  sidebar: {
    collapse: "Contraer barra lateral",
    expand: "Expandir barra lateral",
  },

  home: {
    title: "Inicio",
    welcome: "Bienvenido a Onion Support",
    description: "Tu panel de gestión y soporte está listo.",
    summary: {
      title: "Resumen del sistema",
      apiBase: "API Base",
      currentRoute: "Ruta actual",
      currentTheme: "Tema actual",
      currentLanguage: "Idioma actual",
      authenticated: "Sesión autenticada",
    },
    actions: {
      toggleTheme: "Cambiar tema",
      logState: "Mostrar estado en consola",
    },
  },

  auth: {
    login: {
      title: "Iniciar sesión",
      subtitle: "Accede a tu cuenta para continuar",
      username: "Usuario",
      email: "Correo electrónico",
      password: "Contraseña",
      remember: "Recordarme",
      submit: "Entrar",
      forgotPassword: "He olvidado mi contraseña",
      noAccount: "No tienes cuenta",
    },
    logout: {
      action: "Cerrar sesión",
      success: "Sesión cerrada correctamente",
    },
    session: {
      expired: "Tu sesión ha expirado. Vuelve a iniciar sesión.",
      invalid: "La sesión no es válida.",
      required: "Debes iniciar sesión para continuar.",
      restored: "Sesión restaurada correctamente",
    },
    user: {
      guest: "Invitado",
    },
  },

  account: {
    title: "Cuenta",
    profile: "Perfil",
    security: "Seguridad",
    preferences: "Preferencias",
  },

  settings: {
    title: "Ajustes",
    appearance: "Apariencia",
    notifications: "Notificaciones",
    language: "Idioma",
    system: "Sistema",
    theme: {
      label: "Tema",
      dark: "Oscuro",
      light: "Claro",
      auto: "Automático",
      changed: "Tema actualizado",
    },
    languageChanged: "Idioma actualizado",
  },

  clients: {
    title: "Clientes",
    empty: "No hay clientes disponibles",
  },

  users: {
    title: "Usuarios",
    empty: "No hay usuarios disponibles",
  },

  invoices: {
    title: "Facturas",
    empty: "No hay facturas disponibles",
  },

  incidents: {
    title: "Incidencias",
    empty: "No hay incidencias disponibles",
  },

  search: {
    placeholder: "Buscar...",
    empty: "Sin resultados",
    sections: {
      navigation: "Navegación",
      results: "Resultados",
    },
    items: {
      home: "Inicio",
      incidents: "Incidencias",
      invoices: "Facturas",
      users: "Usuarios",
      clients: "Clientes",
      account: "Cuenta",
      settings: "Ajustes",
    },
  },

  theme: {
    light: "Claro",
    dark: "Oscuro",
    changedToLight: "Tema cambiado a claro",
    changedToDark: "Tema cambiado a oscuro",
  },

  toast: {
    close: "Cerrar notificación",
    types: {
      success: "Éxito",
      error: "Error",
      warning: "Aviso",
      info: "Información",
      loading: "Cargando",
    },
    generic: {
      success: "Acción completada correctamente",
      error: "Ha ocurrido un error inesperado",
      warning: "Revisa la información antes de continuar",
      info: "Hay información nueva disponible",
      loading: "Procesando solicitud...",
    },
    actions: {
      dismiss: "Descartar",
      undo: "Deshacer",
      retry: "Reintentar",
    },
  },

  feedback: {
    success: {
      saved: "Cambios guardados correctamente",
      updated: "Datos actualizados correctamente",
      created: "Elemento creado correctamente",
      deleted: "Elemento eliminado correctamente",
      sent: "Envío completado correctamente",
    },
    error: {
      generic: "Se ha producido un error inesperado",
      network: "Error de red. Comprueba tu conexión.",
      server: "El servidor no ha respondido correctamente",
      timeout: "La operación ha tardado demasiado",
      forbidden: "No tienes permisos para realizar esta acción",
      unauthorized: "No autorizado",
      notFound: "No se ha encontrado el recurso solicitado",
      validation: "Revisa los campos marcados",
      saveFailed: "No se han podido guardar los cambios",
      loadFailed: "No se ha podido cargar la información",
    },
  },

  forms: {
    required: "Este campo es obligatorio",
    invalidEmail: "Introduce un correo electrónico válido",
    invalidPhone: "Introduce un teléfono válido",
    minLength: "Debe tener al menos {min} caracteres",
    maxLength: "No puede superar {max} caracteres",
    passwordMismatch: "Las contraseñas no coinciden",
    invalidFormat: "Formato no válido",
  },

  validation: {
    required: "Campo obligatorio",
    invalid: "Valor no válido",
    tooShort: "Valor demasiado corto",
    tooLong: "Valor demasiado largo",
  },

  table: {
    empty: "No hay registros disponibles",
    loading: "Cargando tabla...",
    columns: "Columnas",
    pagination: {
      previous: "Anterior",
      next: "Siguiente",
      page: "Página",
      of: "de",
    },
  },

  status: {
    active: "Activo",
    inactive: "Inactivo",
    pending: "Pendiente",
    resolved: "Resuelto",
    open: "Abierto",
    closed: "Cerrado",
    success: "Correcto",
    error: "Error",
    warning: "Aviso",
    info: "Información",
  },

  dates: {
    today: "Hoy",
    yesterday: "Ayer",
    tomorrow: "Mañana",
  },

  aria: {
    close: "Cerrar",
    open: "Abrir",
    menu: "Menú",
    navigation: "Navegación principal",
    notifications: "Notificaciones",
    userMenu: "Menú de usuario",
  },
};

export default es;
