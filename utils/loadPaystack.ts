// Le script Paystack n'est plus chargé sur toutes les pages : seulement sur la
// page événement (préchargement) et au moment de payer.
const PAYSTACK_SRC = 'https://js.paystack.co/v1/inline.js';
let pending: Promise<void> | null = null;

export function loadPaystack(): Promise<void> {
    if ((window as any).PaystackPop) return Promise.resolve();
    if (pending) return pending;

    pending = new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = PAYSTACK_SRC;
        script.async = true;
        script.onload = () => ((window as any).PaystackPop ? resolve() : reject(new Error('Paystack indisponible')));
        script.onerror = () => {
            script.remove();
            reject(new Error('Chargement du script Paystack impossible'));
        };
        document.head.appendChild(script);
    }).catch(err => {
        pending = null; // nouvel essai possible au prochain appel
        throw err;
    });
    return pending;
}
