import LegalLayout, { Section } from "@/components/LegalLayout";

export default function Privacidad() {
  return (
    <LegalLayout
      title="Política de Privacidad"
      updated="11 de junio de 2026"
      intro="En ARTORIA nos tomamos en serio la protección de tus datos personales. Esta política explica qué información recopilamos, cómo la usamos y qué derechos tienes sobre ella, conforme a la legislación chilena sobre protección de datos personales —actualmente la Ley N° 19.628 y, a partir del 1 de diciembre de 2026, la Ley N° 21.719, que la reemplaza y refuerza los derechos de los titulares."
    >
      <Section title="1. Responsable del tratamiento">
        <p>
          El responsable del tratamiento de tus datos es <strong>ARTORIA</strong>, a quien puedes
          contactar para cualquier consulta relacionada con tu privacidad a través de:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Correo electrónico: <a href="mailto:soporte@artoria.cl" className="text-primary hover:underline">soporte@artoria.cl</a></li>
          <li>Teléfono / WhatsApp: +56 9 4084 2508</li>
        </ul>
      </Section>

      <Section title="2. Qué datos recopilamos">
        <p>Dependiendo de tu interacción con nuestra plataforma, podemos recopilar:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Datos de identificación:</strong> nombre, correo electrónico, número de teléfono y, cuando corresponda, RUT.</li>
          <li><strong>Datos de cuenta:</strong> credenciales de acceso, rol de usuario y empresa asociada.</li>
          <li><strong>Datos de uso del servicio:</strong> conversaciones de atención al cliente, tickets, agendamientos y registros de actividad dentro del portal.</li>
          <li><strong>Datos de facturación y pago:</strong> procesados de forma segura a través de nuestro proveedor de pagos. ARTORIA no almacena los datos completos de tu tarjeta.</li>
          <li><strong>Datos técnicos:</strong> dirección IP, tipo de navegador y datos de sesión necesarios para el funcionamiento y la seguridad del servicio.</li>
        </ul>
      </Section>

      <Section title="3. Cómo usamos tus datos">
        <p>Utilizamos tus datos personales para las siguientes finalidades:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Prestar y operar los servicios contratados.</li>
          <li>Gestionar tu cuenta, autenticación y soporte técnico.</li>
          <li>Procesar pagos y emitir comprobantes.</li>
          <li>Mejorar la calidad, seguridad y rendimiento de la plataforma.</li>
          <li>Cumplir con obligaciones legales y responder requerimientos de autoridades competentes.</li>
        </ul>
        <p>
          No utilizamos tus datos para finalidades distintas a las aquí descritas sin tu consentimiento previo.
        </p>
      </Section>

      <Section title="4. Tratamiento de datos por cuenta de terceros">
        <p>
          Cuando una empresa cliente utiliza ARTORIA para gestionar la comunicación con sus propios usuarios
          finales, ARTORIA actúa como <strong>encargado del tratamiento</strong> por cuenta de dicha empresa,
          que es la responsable de los datos de sus clientes. En esos casos, tratamos los datos únicamente
          según las instrucciones de la empresa contratante y conforme a la normativa vigente.
        </p>
      </Section>

      <Section title="5. Con quién compartimos tus datos">
        <p>
          No vendemos ni cedemos tus datos personales a terceros. Solo los compartimos con proveedores que
          nos ayudan a operar el servicio (por ejemplo, infraestructura en la nube, proveedor de pagos y
          servicios de mensajería), quienes están obligados contractualmente a proteger tu información y a
          usarla exclusivamente para los fines acordados.
        </p>
      </Section>

      <Section title="6. Conservación de los datos">
        <p>
          Conservamos tus datos personales mientras mantengas una cuenta activa o sea necesario para prestar
          el servicio. Una vez finalizada la relación, conservaremos la información solo durante el tiempo
          requerido para cumplir obligaciones legales, contables o de seguridad, tras lo cual será eliminada
          o anonimizada.
        </p>
      </Section>

      <Section title="7. Tus derechos">
        <p>
          De acuerdo con la legislación chilena, tienes derecho a acceder, rectificar, cancelar y oponerte
          al tratamiento de tus datos personales, así como a solicitar su portabilidad y a revocar tu
          consentimiento. Para ejercer cualquiera de estos derechos, escríbenos a{" "}
          <a href="mailto:soporte@artoria.cl" className="text-primary hover:underline">soporte@artoria.cl</a>.
          Responderemos tu solicitud en los plazos que establece la ley. Asimismo, tendrás derecho a
          presentar reclamos ante la Agencia de Protección de Datos Personales una vez que esta entre en
          funcionamiento.
        </p>
      </Section>

      <Section title="8. Seguridad de la información">
        <p>
          Aplicamos medidas técnicas y organizativas razonables para proteger tus datos frente a accesos no
          autorizados, pérdida o alteración, incluyendo cifrado en tránsito, control de accesos por roles y
          monitoreo de seguridad. Ningún sistema es 100% infalible, pero trabajamos continuamente para
          mantener un alto estándar de protección.
        </p>
      </Section>

      <Section title="9. Cambios en esta política">
        <p>
          Podemos actualizar esta Política de Privacidad para reflejar cambios en nuestros servicios o en la
          normativa aplicable. Publicaremos cualquier modificación en esta misma página, indicando la fecha
          de última actualización.
        </p>
      </Section>

      <Section title="10. Contacto">
        <p>
          Si tienes preguntas sobre esta política o sobre el tratamiento de tus datos, contáctanos en{" "}
          <a href="mailto:soporte@artoria.cl" className="text-primary hover:underline">soporte@artoria.cl</a>.
        </p>
      </Section>
    </LegalLayout>
  );
}
