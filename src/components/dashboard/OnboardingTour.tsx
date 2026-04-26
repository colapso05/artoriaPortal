import { useEffect, useState } from 'react';
import Joyride, { Step, CallBackProps, STATUS } from 'react-joyride';

interface Props {
    run: boolean;
    view: string;
    onFinish: () => void;
    isAdmin?: boolean;
}

export function OnboardingTour({ run, view, onFinish, isAdmin = false }: Props) {
    const [steps, setSteps] = useState<Step[]>([]);

    useEffect(() => {
        if (view === "home") {
            if (isAdmin) {
                setSteps([
                    {
                        target: '.tour-home-welcome',
                        content: '¡Bienvenido a Artoria! Desde este panel puedes gestionar todas las empresas y supervisar el sistema.',
                        placement: 'bottom',
                        disableBeacon: true,
                    },
                    {
                        target: '.tour-sidebar-empresas',
                        content: 'En "Empresas" puedes crear, editar y simular el acceso de cada cliente.',
                        placement: 'right',
                    },
                    {
                        target: '.tour-sidebar-bandeja',
                        content: 'La "Bandeja" centraliza todas las conversaciones de WhatsApp de todas las empresas.',
                        placement: 'right',
                    },
                    {
                        target: '.tour-sidebar-tickets',
                        content: 'En "Tickets" encuentras todas las derivaciones y su estado de resolución.',
                        placement: 'right',
                    },
                    {
                        target: '.tour-sidebar-coberturas',
                        content: 'En "Coberturas" gestionas los mapas de zonas de cobertura y el sistema de alertas masivas.',
                        placement: 'right',
                    },
                ]);
            } else {
                setSteps([
                    {
                        target: '.tour-home-welcome',
                        content: '¡Bienvenido! Desde aquí tienes un resumen de la actividad de tu empresa en tiempo real.',
                        placement: 'bottom',
                        disableBeacon: true,
                    },
                    {
                        target: '.tour-sidebar-bandeja',
                        content: 'La "Bandeja" es donde recibes y respondes los mensajes de WhatsApp de tus clientes.',
                        placement: 'right',
                    },
                    {
                        target: '.tour-sidebar-tickets',
                        content: 'Los "Tickets" son derivaciones de soporte. Puedes ver su estado y resolverlos desde aquí.',
                        placement: 'right',
                    },
                    {
                        target: '.tour-sidebar-atajos',
                        content: 'Los "Atajos" te permiten guardar mensajes predefinidos que puedes insertar con / en la bandeja.',
                        placement: 'right',
                    },
                ]);
            }
        } else if (view === "inbox") {
            setSteps([
                {
                    target: '.tour-inbox-sidebar',
                    content: 'Aquí están todas tus conversaciones. Usa los filtros rápidos para encontrar las que necesitas.',
                    placement: 'right',
                    disableBeacon: true,
                },
                {
                    target: '.tour-inbox-chat',
                    content: 'El área de mensajes muestra la conversación completa con el cliente.',
                    placement: 'top',
                },
                {
                    target: '.tour-inbox-metadata',
                    content: 'Panel de gestión: controla el Agente IA, asigna tickets y revisa el historial del cliente.',
                    placement: 'left',
                }
            ]);
        } else if (view === "team") {
            setSteps([
                {
                    target: '.tour-team-manager',
                    content: 'Gestiona tu equipo desde aquí. Asigna roles (Supervisor, Operador) con distintos niveles de acceso.',
                    placement: 'top',
                    disableBeacon: true,
                }
            ]);
        } else {
            setSteps([]);
        }
    }, [view, isAdmin]);

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
