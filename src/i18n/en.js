/* =========================================================
   Onion SPA - i18n EN
   Archivo: src/i18n/en.js

   Responsabilidades:
   - diccionario base en inglés
   - textos globales de la SPA
   - labels de navegación
   - acciones comunes
   - auth / estados / errores
   - soporte inicial para toast
   - estructura escalable por namespaces
========================================================= */

const en = {
  meta: {
    appName: "Onion Support",
    language: "English",
    locale: "en-GB",
  },

  common: {
    ok: "OK",
    yes: "Yes",
    no: "No",
    save: "Save",
    cancel: "Cancel",
    close: "Close",
    accept: "Accept",
    continue: "Continue",
    back: "Back",
    retry: "Retry",
    refresh: "Refresh",
    reload: "Reload",
    edit: "Edit",
    delete: "Delete",
    remove: "Remove",
    add: "Add",
    create: "Create",
    search: "Search",
    filter: "Filter",
    clear: "Clear",
    loading: "Loading",
    sending: "Sending",
    processing: "Processing",
    selected: "Selected",
    all: "All",
    none: "None",
    status: "Status",
    actions: "Actions",
    name: "Name",
    email: "Email",
    phone: "Phone",
    date: "Date",
    hour: "Time",
    description: "Description",
    details: "Details",
    viewMore: "View more",
    viewLess: "View less",
    enabled: "Enabled",
    disabled: "Disabled",
    language: "Language",
    theme: "Theme",
    user: "User",
    role: "Role",
    unknown: "Unknown",
    notAvailable: "Not available",
    noResults: "No results found",
    noData: "No data available",
    welcome: "Welcome",
    goodbye: "See you soon",
  },

  app: {
    title: "Onion Support",
    subtitle: "Support panel",
    loading: "Starting application...",
    booting: "Preparing environment...",
    ready: "Application ready",
    offline: "Offline",
    online: "Connection restored",
    notFound: {
      title: "Page not found",
      message: "The route you are trying to open does not exist or is no longer available.",
      action: "Back to home",
    },
    forbidden: {
      title: "Access denied",
      message: "You do not have permission to access this section.",
    },
  },

  nav: {
    home: "Home",
    dashboard: "Dashboard",
    incidents: "Incidents",
    tickets: "Tickets",
    invoices: "Invoices",
    users: "Users",
    clients: "Clients",
    account: "Account",
    settings: "Settings",
    login: "Login",
    logout: "Log out",
  },

  topbar: {
    searchPlaceholder: "Search in the application...",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    openUserMenu: "Open user menu",
    changeTheme: "Change theme",
    changeLanguage: "Change language",
  },

  sidebar: {
    collapse: "Collapse sidebar",
    expand: "Expand sidebar",
  },

  home: {
    title: "Home",
    welcome: "Welcome to Onion Support",
    description: "Your management and support panel is ready.",
    summary: {
      title: "System summary",
      apiBase: "API Base",
      currentRoute: "Current route",
      currentTheme: "Current theme",
      currentLanguage: "Current language",
      authenticated: "Authenticated session",
    },
    actions: {
      toggleTheme: "Toggle theme",
      logState: "Log state to console",
    },
  },

  auth: {
    login: {
      title: "Sign in",
      subtitle: "Access your account to continue",
      username: "Username",
      email: "Email",
      password: "Password",
      remember: "Remember me",
      submit: "Sign in",
      forgotPassword: "I forgot my password",
      noAccount: "You do not have an account",
    },
    logout: {
      action: "Log out",
      success: "Session closed successfully",
    },
    session: {
      expired: "Your session has expired. Please sign in again.",
      invalid: "The session is not valid.",
      required: "You must sign in to continue.",
      restored: "Session restored successfully",
    },
    user: {
      guest: "Guest",
    },
  },

  account: {
    title: "Account",
    profile: "Profile",
    security: "Security",
    preferences: "Preferences",
  },

  settings: {
    title: "Settings",
    appearance: "Appearance",
    notifications: "Notifications",
    language: "Language",
    system: "System",
    theme: {
      label: "Theme",
      dark: "Dark",
      light: "Light",
      auto: "Auto",
      changed: "Theme updated",
    },
    languageChanged: "Language updated",
  },

  clients: {
    title: "Clients",
    empty: "No clients available",
  },

  users: {
    title: "Users",
    empty: "No users available",
  },

  invoices: {
    title: "Invoices",
    empty: "No invoices available",
  },

  incidents: {
    title: "Incidents",
    empty: "No incidents available",
  },

  search: {
    placeholder: "Search...",
    empty: "No results",
    sections: {
      navigation: "Navigation",
      results: "Results",
    },
    items: {
      home: "Home",
      incidents: "Incidents",
      invoices: "Invoices",
      users: "Users",
      clients: "Clients",
      account: "Account",
      settings: "Settings",
    },
  },

  theme: {
    light: "Light",
    dark: "Dark",
    changedToLight: "Theme changed to light",
    changedToDark: "Theme changed to dark",
  },

  toast: {
    close: "Close notification",
    types: {
      success: "Success",
      error: "Error",
      warning: "Warning",
      info: "Information",
      loading: "Loading",
    },
    generic: {
      success: "Action completed successfully",
      error: "An unexpected error has occurred",
      warning: "Review the information before continuing",
      info: "New information is available",
      loading: "Processing request...",
    },
    actions: {
      dismiss: "Dismiss",
      undo: "Undo",
      retry: "Retry",
    },
  },

  feedback: {
    success: {
      saved: "Changes saved successfully",
      updated: "Data updated successfully",
      created: "Item created successfully",
      deleted: "Item deleted successfully",
      sent: "Sent successfully",
    },
    error: {
      generic: "An unexpected error has occurred",
      network: "Network error. Check your connection.",
      server: "The server did not respond correctly",
      timeout: "The operation took too long",
      forbidden: "You do not have permission to perform this action",
      unauthorized: "Unauthorized",
      notFound: "The requested resource was not found",
      validation: "Please review the highlighted fields",
      saveFailed: "Could not save changes",
      loadFailed: "Could not load information",
    },
  },

  forms: {
    required: "This field is required",
    invalidEmail: "Enter a valid email address",
    invalidPhone: "Enter a valid phone number",
    minLength: "Must be at least {min} characters",
    maxLength: "Cannot exceed {max} characters",
    passwordMismatch: "Passwords do not match",
    invalidFormat: "Invalid format",
  },

  validation: {
    required: "Required field",
    invalid: "Invalid value",
    tooShort: "Value is too short",
    tooLong: "Value is too long",
  },

  table: {
    empty: "No records available",
    loading: "Loading table...",
    columns: "Columns",
    pagination: {
      previous: "Previous",
      next: "Next",
      page: "Page",
      of: "of",
    },
  },

  status: {
    active: "Active",
    inactive: "Inactive",
    pending: "Pending",
    resolved: "Resolved",
    open: "Open",
    closed: "Closed",
    success: "Success",
    error: "Error",
    warning: "Warning",
    info: "Information",
  },

  dates: {
    today: "Today",
    yesterday: "Yesterday",
    tomorrow: "Tomorrow",
  },

  aria: {
    close: "Close",
    open: "Open",
    menu: "Menu",
    navigation: "Main navigation",
    notifications: "Notifications",
    userMenu: "User menu",
  },
};

export default en;
