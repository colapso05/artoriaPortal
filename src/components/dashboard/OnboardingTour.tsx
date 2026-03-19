import { useEffect, useState } from 'react';
import Joyride, { Step, CallBackProps, STATUS } from 'react-joyride';

interface Props {
    run: boolean;
    view: string;
    onFinish: () => void;
}

export function OnboardingTour({ run, view, onFinish }: Props) {
    const [steps, setSteps] = useState<Step[]>([]);

    useEffect(() => {
        if (view === "inbox") {
            setSteps([
                {
                    target: '.tour-inbox-sidebar',
                    content: 'Bienvenido al nuevo Omnichat. Aquí puedes ver todas las conversaciones y usar los filtros rápidos.',
                    placement: 'right',
                    disableBeacon: true,
                },
                {
                    target: '.tour-inbox-chat',
                    content: 'El área de mensajes ha sido optimizada para mostrar más contenido con burbujas más compactas.',
                    placement: 'top',
                },
                {
                    target: '.tour-inbox-metadata',
                    content: 'Panel de gestión: Revisa el estado del Agente IA, acciones rápidas y deriva a técnicos cuando sea necesario.',
                    placement: 'left',
                }
            ]);
        } else if (view === "team") {
            setSteps([
                {
                    target: '.tour-team-manager',
                    content: 'Gestiona a tu equipo desde este panel. Ahora puedes asignar roles específicos como Soporte o Visualizador con distintos niveles de acceso.',
                    placement: 'top',
                    disableBeacon: true,
                }
            ]);
        } else {
            setSteps([]);
        }
    }, [view]);

    const handleJoyrideCallback = (data: CallBackProps) => {
        const { status } = data;
        if (([STATUS.FINISHED, STATUS.SKIPPED] as string[]).includes(status)) {
            onFinish();
        }
    };

    if (steps.length === 0) return null;

    return (
        <Joyride
            steps={steps}
            run={run}
            continuous
            showSkipButton
            showProgress
            callback={handleJoyrideCallback}
            styles={{
                options: {
                    primaryColor: 'hsl(var(--primary))',
                    zIndex: 10000,
                }
            }}
            locale={{
                back: 'Atrás',
                close: 'Cerrar',
                last: 'Finalizar',
                next: 'Siguiente',
                skip: 'Saltar tour',
            }}
        />
    );
}
