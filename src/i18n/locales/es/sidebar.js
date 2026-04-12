/* =========================================================
   Onion SPA - I18n Español
   Archivo: src/i18n/locales/es/es.js

   Responsabilidades:
   - traducciones en español para Sidebar
   - traducciones de títulos de rutas
   - paridad exacta de keys con en / ca
   - preparado para runtime i18n live
========================================================= */

export const es = {
  sidebar: {
    aria: {
      main: "Barra lateral principal",
      navigation: "Navegación principal",
    },

    logo: {
      ariaLabel: "Ir al inicio",
      tooltip: "Inicio",
      alt: "Onion Support",
    },

    toggle: {
      collapse: "Contraer barra lateral",
    },

    menu: {
      home: "Inicio",
      tickets: "Incidencias",
      invoices: "Facturas",
      users: "Usuarios",
      clients: "Clientes",
      account: "Cuenta",
      settings: "Ajustes",
      server: "Servidor",
    },

    recents: {
      ariaLabel: "Recientes",
      title: "Recientes",
    },

    user: {
      toggleAriaLabel: "Abrir menú de usuario",
      avatarAriaLabel: "Avatar de usuario",
      defaultName: "Usuario",
      dropdownAriaLabel: "Menú de usuario",

      addAccount: "Añadir cuenta",
      changePlan: "Cambiar plan",
      profile: "Perfil",
      settings: "Configuración",
      help: "Ayuda",
      logout: "Cerrar sesión",
    },
  },

  routes: {
    home: "Onion Support",
    incidencias: "Incidencias",
    facturas: "Facturas",
    usuarios: "Usuarios",
    clientes: "Clientes",
    cuenta: "Cuenta",
    ajustes: "Ajustes",
    servidor: "Servidor",
    login: "Acceso",
  },
};

export default es;
