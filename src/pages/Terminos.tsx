import LegalLayout, { Section } from "@/components/LegalLayout";

export default function Terminos() {
  return (
    <LegalLayout
      title="Términos y Condiciones"
      updated="11 de junio de 2026"
      intro="Estos Términos y Condiciones regulan el acceso y uso de la plataforma ARTORIA. Al registrarte o utilizar nuestros servicios, aceptas estos términos en su totalidad. Te recomendamos leerlos con atención."
    >
      <Section title="1. Aceptación de los términos">
        <p>
          Al acceder o utilizar la plataforma ARTORIA, declaras haber leído, comprendido y aceptado estos
          Términos y Condiciones, así como nuestra Política de Privacidad. Si no estás de acuerdo con ellos,
          debes abstenerte de utilizar el servicio.
        </p>
      </Section>

      <Section title="2. Descripción del servicio">
        <p>
          ARTORIA es una plataforma de software como servicio (SaaS) que ofrece herramientas para la
          gestión de atención al cliente, comunicación, agendamiento, facturación y análisis para empresas.
          Nos reservamos el derecho de modificar, ampliar o discontinuar funcionalidades para mejorar el
          servicio, notificando los cambios relevantes cuando corresponda.
        </p>
      </Section>

      <Section title="3. Registro y cuenta de usuario">
        <ul className="list-disc pl-5 space-y-1">
          <li>Para usar el servicio debes crear una cuenta con información veraz y mantenerla actualizada.</li>
          <li>Eres responsable de mantener la confidencialidad de tus credenciales de acceso.</li>
          <li>Eres responsable de toda actividad que ocurra bajo tu cuenta.</li>
          <li>Debes notificarnos de inmediato ante cualquier uso no autorizado de tu cuenta.</li>
        </ul>
      </Section>

      <Section title="4. Uso aceptable">
        <p>Al utilizar ARTORIA, te comprometes a no:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Usar el servicio para fines ilícitos o no autorizados.</li>
          <li>Enviar comunicaciones masivas no solicitadas (spam) o contenido fraudulento.</li>
          <li>Vulnerar derechos de terceros, incluyendo propiedad intelectual y privacidad.</li>
          <li>Intentar acceder sin autorización a sistemas, datos o cuentas de otros usuarios.</li>
          <li>Interferir con el funcionamiento o la seguridad de la plataforma.</li>
        </ul>
        <p>
          El incumplimiento de estas condiciones puede derivar en la suspensión o cancelación de tu cuenta.
        </p>
      </Section>

      <Section title="5. Planes, pagos y facturación">
        <ul className="list-disc pl-5 space-y-1">
          <li>Algunos servicios se ofrecen bajo planes de pago o sistema de créditos, según lo informado en la plataforma.</li>
          <li>Los pagos se procesan a través de proveedores de pago externos y seguros.</li>
          <li>Los precios pueden actualizarse; los cambios se comunicarán con antelación razonable.</li>
          <li>Salvo que la ley disponga lo contrario, los montos pagados no son reembolsables una vez consumido el servicio correspondiente.</li>
        </ul>
      </Section>

      <Section title="6. Propiedad intelectual">
        <p>
          Todos los derechos sobre la plataforma, su software, diseño, marcas y contenidos pertenecen a
          ARTORIA o a sus licenciantes. No se concede ningún derecho de propiedad sobre el servicio más allá
          de la licencia de uso limitada, no exclusiva e intransferible que te otorgamos para utilizarlo
          conforme a estos términos. El contenido que tú ingresas a la plataforma sigue siendo tuyo.
        </p>
      </Section>

      <Section title="7. Disponibilidad del servicio">
        <p>
          Nos esforzamos por mantener el servicio disponible de forma continua, pero no garantizamos que
          esté libre de interrupciones, errores o mantenimientos. Podremos realizar tareas de mantención
          programada procurando minimizar el impacto en los usuarios.
        </p>
      </Section>

      <Section title="8. Limitación de responsabilidad">
        <p>
          En la máxima medida permitida por la ley, ARTORIA no será responsable por daños indirectos,
          incidentales o lucro cesante derivados del uso o la imposibilidad de uso del servicio. El servicio
          se proporciona "tal cual" y "según disponibilidad". Nada en estos términos limita responsabilidades
          que no puedan excluirse legalmente.
        </p>
      </Section>

      <Section title="9. Suspensión y terminación">
        <p>
          Puedes dejar de usar el servicio en cualquier momento. Podemos suspender o cancelar tu acceso si
          incumples estos términos, si lo exige la ley, o por razones de seguridad. En caso de terminación,
          las disposiciones que por su naturaleza deban subsistir (como propiedad intelectual y limitación de
          responsabilidad) seguirán vigentes.
        </p>
      </Section>

      <Section title="10. Legislación aplicable">
        <p>
          Estos Términos y Condiciones se rigen por las leyes de la República de Chile. Cualquier
          controversia se someterá a los tribunales competentes de Chile, sin perjuicio de los derechos que
          la ley reconozca a los consumidores.
        </p>
      </Section>

      <Section title="11. Contacto">
        <p>
          Para consultas sobre estos términos, escríbenos a{" "}
          <a href="mailto:soporte@artoria.cl" className="text-primary hover:underline">soporte@artoria.cl</a>.
        </p>
      </Section>
    </LegalLayout>
  );
}
