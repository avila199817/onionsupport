/* Public legal identity shared with oniontech/template/base.template.js.
   Verified against the transactional template and delivered mail, September 2026.
   Pure HTML renderer: safe for static documents and public SPA views. */
export const PUBLIC_LEGAL = Object.freeze({
  name: "Onion Support",
  owner: "Cristian Ávila Luque",
  taxId: "20568568J",
  address: "C/ Rafael de Casanova, 54, 1.º 3.ª, 08295 Sant Vicenç de Castellet (Barcelona)",
  email: "soporte@onionsupport.com",
  phone: "629 946 615",
  phoneHref: "+34629946615",
  hours: "Lunes a viernes, de 9:00 a 14:00 y de 16:00 a 20:00; sábados, de 10:00 a 14:00. Domingos cerrado.",
});

function escape(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

const supportLink = () => `<a href="mailto:${PUBLIC_LEGAL.email}">${PUBLIC_LEGAL.email}</a>`;

export function renderPublicLegalFooter({ className = "" } = {}) {
  return `
    <footer class="public-legal-footer ${escape(className)}" aria-label="Información de Onion Support">
      <div class="public-legal-footer__inner">
        <div class="public-legal-footer__overview">
          <div class="public-legal-footer__identity">
            <a class="public-legal-footer__brand" href="/">Onion Support</a>
            <p>Servicio técnico informático para particulares y empresas.</p>
            <p>${escape(PUBLIC_LEGAL.owner)} · Profesional autónomo<br>NIF ${PUBLIC_LEGAL.taxId}</p>
            <address>${escape(PUBLIC_LEGAL.address)}</address>
          </div>
          <div>
            <p class="public-legal-footer__label">Atención al cliente</p>
            <p>${supportLink()}<br><a href="tel:${PUBLIC_LEGAL.phoneHref}">${PUBLIC_LEGAL.phone}</a></p>
            <a href="/#incidencia">Solicitar asistencia</a>
          </div>
          <div>
            <p class="public-legal-footer__label">Horario de atención</p>
            <p>Lunes a viernes<br>9:00–14:00 y 16:00–20:00</p>
            <p>Sábados · 10:00–14:00<br>Domingos cerrado</p>
          </div>
        </div>

        <div class="public-legal-footer__disclosures">
          <details id="public-legal-notice" class="public-legal-footer__section">
            <summary>Aviso legal y servicio</summary>
            <div class="public-legal-footer__content">
              <p>Onion Support es el nombre comercial de ${escape(PUBLIC_LEGAL.owner)}, profesional autónomo con NIF ${PUBLIC_LEGAL.taxId} y domicilio profesional en ${escape(PUBLIC_LEGAL.address)}.</p>
              <p>Prestamos servicios de soporte microinformático, mantenimiento, diagnóstico, reparación, configuración y asistencia tecnológica para particulares y empresas. Los servicios se rigen por el presupuesto, pedido o parte de trabajo aceptado y por las condiciones aplicables.</p>
              <p>Antes de entregar un dispositivo para su revisión o reparación, recomendamos disponer de una copia de seguridad actualizada. Cuando una avería afecte al almacenamiento, no siempre podrá garantizarse la conservación o recuperación de los datos, sin perjuicio de los derechos que legalmente correspondan al cliente.</p>
              <p>Si contratas como consumidor a distancia o fuera del establecimiento, dispones, con carácter general, de catorce días naturales desde la contratación del servicio para desistir, con las excepciones y ampliaciones legalmente previstas. Para comenzar durante ese plazo se requiere tu solicitud expresa; la pérdida del derecho una vez completado el servicio requiere tu reconocimiento previo. Estas condiciones se concretan al contratar.</p>
              <p>Para consultas y reclamaciones, contacta mediante ${supportLink()} o el ${PUBLIC_LEGAL.phone}. Las hojas oficiales de reclamación están a disposición de las personas consumidoras y usuarias. Puedes consultar los <a href="https://consum.gencat.cat/ca/empreses/requisits-obligatoris/descarrega-de-cartells-i-documents/" target="_blank" rel="noopener noreferrer">formularios oficiales de la Agència Catalana del Consum</a>.</p>
            </div>
          </details>

          <details id="public-privacy" class="public-legal-footer__section">
            <summary>Privacidad y datos personales</summary>
            <div class="public-legal-footer__content">
              <p><strong>Responsable.</strong> ${escape(PUBLIC_LEGAL.owner)} (Onion Support), NIF ${PUBLIC_LEGAL.taxId}, en el domicilio profesional indicado arriba. Contacto para privacidad y ejercicio de derechos: ${supportLink()}.</p>
              <p><strong>Solicitudes y servicios.</strong> Tratamos los datos que facilitas para gestionar solicitudes, presupuestos, servicios contratados, facturación y atención al cliente. El formulario de soporte recoge nombre, correo, teléfono, dirección y la información del problema. Los campos obligatorios son necesarios para tramitar la solicitud; evita incluir contraseñas o información personal que no sea necesaria.</p>
              <p><strong>Cuenta y comunicaciones.</strong> La solicitud se vincula a tu cuenta de acceso. Si todavía no tienes una, se prepara una cuenta pendiente y se envía por correo su activación para que puedas continuar la gestión. También se utilizan los datos de contacto para las comunicaciones relacionadas con tu solicitud y el servicio.</p>
              <p><strong>Base del tratamiento.</strong> La gestión de solicitudes, presupuestos y servicios se basa en las medidas previas a la contratación que solicitas y, cuando procede, en la ejecución del contrato. La facturación responde a las obligaciones legales aplicables. Los controles de seguridad y prevención del abuso protegen el servicio sobre la base del interés legítimo. El uso de cookies opcionales se basa en tu consentimiento y se explica en el apartado de cookies.</p>
              <p><strong>Conservación.</strong> Los criterios de conservación dependen de la gestión de la solicitud, la relación de servicio y los plazos legales aplicables a la documentación y a posibles responsabilidades. Puedes pedir información sobre la conservación de tus datos concretos en ${supportLink()}.</p>
              <p><strong>Destinatarios y proveedores.</strong> Para prestar el servicio intervienen proveedores de alojamiento, infraestructura y comunicaciones, y las autoridades u organismos que deban recibir información por obligación legal. La medición de la web utiliza Google Analytics y Google Ads según las preferencias y el funcionamiento descritos en cookies. Google informa sobre el tratamiento internacional y sus garantías en sus <a href="https://policies.google.com/privacy/frameworks?hl=es" target="_blank" rel="noopener noreferrer">marcos de transferencia de datos</a>. Puedes solicitar información adicional sobre los proveedores que intervienen en tu servicio.</p>
              <p><strong>Tus derechos.</strong> Puedes solicitar acceso, rectificación, supresión, oposición, limitación del tratamiento y portabilidad cuando correspondan, escribiendo a ${supportLink()}. Puedes retirar tu consentimiento en cualquier momento, sin afectar a la licitud del tratamiento anterior, y presentar una reclamación ante la <a href="https://www.aepd.es/" target="_blank" rel="noopener noreferrer">Agencia Española de Protección de Datos</a>.</p>
            </div>
          </details>

          <details id="public-cookies" class="public-legal-footer__section">
            <summary>Cookies y medición de la web</summary>
            <div class="public-legal-footer__content">
              <p>Las cookies y tecnologías similares guardan o consultan información en tu dispositivo. Esta web distingue las funciones técnicas necesarias de las opciones de medición. Puedes aceptar, rechazar o configurar las opciones de medición y cambiar tu decisión cuando quieras.</p>
              <ul>
                <li><strong>Preferencia técnica propia.</strong> Recordamos tu elección de medición en el almacenamiento local del navegador durante 180 días.</li>
                <li><strong>Analítica de Google.</strong> Si aceptas esta categoría, medimos visitas, páginas vistas y uso de las páginas públicas comerciales con Google Analytics.</li>
                <li><strong>Medición publicitaria de Google.</strong> Si aceptas esta categoría, utilizamos Google Ads para atribuir contactos a campañas. La personalización publicitaria permanece desactivada.</li>
              </ul>
              <p>La etiqueta de Google se carga en las páginas públicas comerciales con el almacenamiento de analítica y publicidad denegado por defecto. Antes de aceptar o si rechazas, Google puede recibir señales sin cookies sobre el consentimiento y la navegación. Aceptar una categoría permite el uso de sus cookies; rechazarla mantiene denegado ese almacenamiento. El formulario y el acceso a tu cuenta siguen disponibles cualquiera que sea tu decisión.</p>
              <p>La preferencia de 180 días corresponde a tu elección en esta web. La duración de las cookies de Google depende de su tipo y configuración; Google detalla sus finalidades y duraciones en <a href="https://policies.google.com/technologies/cookies?hl=es" target="_blank" rel="noopener noreferrer">Cómo utiliza Google las cookies</a>. Consulta también su <a href="https://policies.google.com/privacy?hl=es" target="_blank" rel="noopener noreferrer">política de privacidad</a>.</p>
              <p>Puedes retirar o cambiar las opciones desde «Configurar cookies». Para eliminar datos ya guardados, utiliza también los ajustes de cookies y datos de sitios de tu navegador. Si borras la preferencia o utilizas otro navegador, tendrás que decidir de nuevo.</p>
            </div>
          </details>
        </div>

        <div class="public-legal-footer__bottom">
          <p>Información de Onion Support</p>
          <button type="button" data-public-cookie-settings>Configurar cookies</button>
        </div>
      </div>
    </footer>
  `;
}
