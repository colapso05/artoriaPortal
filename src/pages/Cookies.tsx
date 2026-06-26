import LegalLayout, { Section } from "@/components/LegalLayout";

export default function Cookies() {
  return (
    <LegalLayout
      title="Política de Cookies"
      updated="11 de junio de 2026"
      intro="Esta Política de Cookies explica qué son las cookies y tecnologías similares, cuáles utilizamos en ARTORIA y cómo puedes gestionarlas."
    >
      <Section title="1. ¿Qué son las cookies?">
        <p>
          Las cookies son pequeños archivos de texto que se almacenan en tu dispositivo cuando visitas un
          sitio web. Permiten que el sitio recuerde tus acciones y preferencias durante un período de tiempo,
          facilitando tu navegación y mejorando tu experiencia. También usamos tecnologías similares como el
          almacenamiento local del navegador (localStorage).
        </p>
      </Section>

      <Section title="2. Tipos de cookies que utilizamos">
        <p>En ARTORIA empleamos principalmente las siguientes categorías:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Cookies estrictamente necesarias:</strong> imprescindibles para el funcionamiento del
            portal, como mantener tu sesión iniciada y garantizar la seguridad. Sin ellas, el servicio no
            puede operar correctamente.
          </li>
          <li>
            <strong>Cookies de preferencias:</strong> recuerdan tus elecciones, como el tema visual u otras
            configuraciones, para personalizar tu experiencia.
          </li>
          <li>
            <strong>Cookies técnicas y de rendimiento:</strong> nos ayudan a detectar errores y a entender
            cómo se utiliza la plataforma para mejorar su estabilidad y desempeño. Esta información se trata
            de forma agregada y no se utiliza para identificarte personalmente.
          </li>
        </ul>
      </Section>

      <Section title="3. Cookies de terceros">
        <p>
          Algunas funcionalidades dependen de proveedores externos (por ejemplo, el procesamiento de pagos o
          el monitoreo de errores) que pueden establecer sus propias cookies o tecnologías equivalentes.
          Estos proveedores tratan la información conforme a sus propias políticas de privacidad.
        </p>
      </Section>

      <Section title="4. Gestión de cookies">
        <p>
          Puedes configurar tu navegador para aceptar, rechazar o eliminar cookies. Ten en cuenta que si
          bloqueas las cookies estrictamente necesarias, es posible que algunas funciones del portal no
          funcionen correctamente, como el inicio de sesión.
        </p>
        <p>
          La mayoría de los navegadores permiten gestionar las cookies desde su menú de configuración o
          privacidad. Consulta la ayuda de tu navegador para más detalles.
        </p>
      </Section>

      <Section title="5. Cambios en esta política">
        <p>
          Podemos actualizar esta Política de Cookies cuando incorporemos nuevas tecnologías o cambien las
          existentes. Publicaremos cualquier cambio en esta página con su fecha de actualización.
        </p>
      </Section>

      <Section title="6. Contacto">
        <p>
          Si tienes dudas sobre nuestro uso de cookies, escríbenos a{" "}
          <a href="mailto:soporte@artoria.cl" className="text-primary hover:underline">soporte@artoria.cl</a>.
        </p>
      </Section>
    </LegalLayout>
  );
}
