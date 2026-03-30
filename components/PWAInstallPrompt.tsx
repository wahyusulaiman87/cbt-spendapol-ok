import React, { useState, useEffect } from 'react';
import { Download } from 'lucide-react';

export const PWAInstallPrompt: React.FC = () => {
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const handler = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e);
            setIsVisible(true);
            
            // Hide after 15 seconds
            const timer = setTimeout(() => {
                setIsVisible(false);
            }, 15000);

            return () => clearTimeout(timer);
        };

        window.addEventListener('beforeinstallprompt', handler);

        return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    const handleInstallClick = async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            setIsVisible(false);
        }
        setDeferredPrompt(null);
    };

    if (!isVisible) return null;

    return (
        <div className="fixed bottom-6 right-6 z-[999] animate-bounce">
            <button 
                onClick={handleInstallClick}
                className="bg-blue-600 text-white px-4 py-3 rounded-full shadow-2xl flex items-center space-x-3 hover:bg-blue-700 transition transform hover:scale-105 border-4 border-white"
            >
                <div className="bg-white/20 p-1.5 rounded-full">
                    <Download size={20} />
                </div>
                <div className="text-left">
                    <p className="text-xs font-bold opacity-90">Install Aplikasi</p>
                    <p className="text-sm font-extrabold leading-none">Uji TKA Mandiri</p>
                </div>
            </button>
        </div>
    );
};