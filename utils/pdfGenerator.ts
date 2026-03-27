import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import QRCode from 'qrcode';

/**
 * Génère le QR code en base64 directement dans le navigateur
 */
const generateQrBase64 = async (data: string): Promise<string> => {
  try {
    return await QRCode.toDataURL(data, {
      width: 400, // Higher resolution for PDF
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' }
    });
  } catch (err) {
    console.error('QR generation error:', err);
    return '';
  }
};

const getBase64ImageFromUrl = async (imageUrl: string): Promise<string> => {
  try {
    const res = await fetch(imageUrl);
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.error('Failed to load image as base64', e);
    return '';
  }
};

export const generateTicketPDF = async (ticket: any) => {
  const container = document.createElement('div');
  container.className = 'afritix-pdf-render-container';
  container.style.position = 'absolute';
  container.style.top = '-9999px';
  container.style.left = '0';
  container.style.width = '400px';
  container.style.background = '#0f172a';
  container.style.color = '#ffffff';
  container.style.fontFamily = 'system-ui, -apple-system, sans-serif';
  container.style.padding = '0';
  container.style.borderRadius = '16px';
  container.style.overflow = 'hidden';

  const eventDate = new Date(ticket.eventDate);
  const formattedDate = eventDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const formattedTime = eventDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  // 1. Generate QR base64 once
  const qrDataBase64 = await generateQrBase64(ticket.qrCode);

  let organizerLogoSrc = '';
  if (ticket.organizerLogo && ticket.organizerLogo.startsWith('http')) {
    organizerLogoSrc = await getBase64ImageFromUrl(ticket.organizerLogo);
  }

  // 2. HTML Template - Use a placeholder for the QR code to ensure layout
  container.innerHTML = `
    <div style="background: linear-gradient(135deg, #ea580c 0%, #d97706 100%); padding: 30px; text-align: center;">
      <h1 style="margin: 0; font-size: 28px; font-weight: 900; color: white; text-transform: uppercase; letter-spacing: 2px;">
        ${ticket.eventName}
      </h1>
      <div style="margin-top: 10px; display: inline-block; background: rgba(0,0,0,0.3); padding: 5px 15px; border-radius: 20px; font-weight: bold; font-size: 14px; color: white;">
        ${ticket.type} PASS
      </div>
    </div>
    
    <div style="padding: 20px 30px 10px 30px; display: flex; align-items: center; justify-content: center; gap: 10px; border-bottom: 1px solid #334155;">
        ${organizerLogoSrc ? `<img src="${organizerLogoSrc}" style="width: 30px; height: 30px; border-radius: 50%; object-fit: cover;" />` : ''}
        <p style="margin: 0; font-size: 12px; color: #94a3b8; font-weight: bold; text-transform: uppercase;">
          Organisé par <span style="color: #cbd5e1;">${ticket.organizerName || 'Babipass'}</span>
        </p>
    </div>

    <div style="padding: 20px 30px 30px 30px;">
      <div style="margin-bottom: 25px;">
         <p style="margin: 0; color: #94a3b8; font-size: 12px; text-transform: uppercase; font-weight: bold;">Participant</p>
         <p style="margin: 5px 0 0 0; font-size: 20px; font-weight: bold; color: white;">${ticket.holder || 'Participant Anonyme'}</p>
      </div>

      <div style="display: flex; justify-content: space-between; margin-bottom: 25px;">
        <div style="flex: 1;">
           <p style="margin: 0; color: #94a3b8; font-size: 12px; text-transform: uppercase; font-weight: bold;">Date &amp; Heure</p>
           <p style="margin: 5px 0 0 0; font-size: 14px; font-weight: 600; color: white;">${formattedDate}</p>
           <p style="margin: 2px 0 0 0; font-size: 14px; color: #cbd5e1;">${formattedTime}</p>
        </div>
      </div>

      <div style="margin-bottom: 30px;">
         <p style="margin: 0; color: #94a3b8; font-size: 12px; text-transform: uppercase; font-weight: bold;">Lieu</p>
         <p style="margin: 5px 0 0 0; font-size: 14px; font-weight: 600; color: white;">${ticket.location}</p>
      </div>

      <div style="border-top: 2px dashed #334155; margin: 30px 0;"></div>
      
      <!-- Placeholder Box for QR Code (Wait for manual injection) -->
      <div style="text-align: center; margin-top: 10px;">
        <div id="qr-placeholder" style="width: 220px; height: 220px; margin: 0 auto;">
          <!-- Transparent spacer for jsPDF injection -->
        </div>
        <p style="margin-top: 10px; font-size: 9px; color: #475569; font-family: monospace; word-break: break-all; padding: 0 10px; line-height: 1.4; opacity: 0.8;">
          Ref: ${ticket.id}
        </p>
      </div>

      <div style="text-align: center; margin-top: 20px; padding-top: 15px; border-top: 1px solid #1e293b;">
         <p style="margin: 0; font-size: 11px; font-weight: bold; color: #ea580c;">AFRITIX SECURE TICKET</p>
         <p style="margin: 4px 0 0 0; font-size: 9px; color: #475569;">Billet Cryptographique • Anti-Fraude</p>
      </div>
    </div>
  `;

  document.body.appendChild(container);

  try {
    // Wait for layout and any images
    const images = container.querySelectorAll('img');
    await Promise.all([
      ...Array.from(images).map(img =>
        new Promise(resolve => {
          if (img.complete) resolve(true);
          img.onload = () => resolve(true);
          img.onerror = () => resolve(true);
        })
      ),
      new Promise(r => setTimeout(r, 600)) // Force a layout wait
    ]);

    // 3. Capture Template (without the QR, placeholder is transparent)
    const canvas = await html2canvas(container, {
      scale: 3, // Increased scale for crispness
      useCORS: true,
      backgroundColor: '#0f172a',
      logging: false
    });

    const bgData = canvas.toDataURL('image/png');

    // 4. Create PDF with Dynamic Height
    const pdfWidth = 105; 
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [pdfWidth, pdfHeight]
    });

    // Add background
    pdf.addImage(bgData, 'PNG', 0, 0, pdfWidth, pdfHeight);

    // 5. Inject QR Code Directement
    if (qrDataBase64) {
      // Taille du bloc QR (incluant sa propre marge blanche générée par QRCode.toDataURL)
      const qrBlockSizeMm = 54; 
      const xPos = (pdfWidth - qrBlockSizeMm) / 2;
      
      // Positionnement vertical précis
      // On le place exactement dans la zone du spacer (environ 25mm du bas total)
      const yOffsetFromBottom = 22;
      const yPos = pdfHeight - qrBlockSizeMm - yOffsetFromBottom; 

      // Injection de l'image QR (le padding blanc est déjà inclus dans l'image base64)
      pdf.addImage(qrDataBase64, 'PNG', xPos, yPos, qrBlockSizeMm, qrBlockSizeMm);
    }

    const filename = `Babipass_${ticket.eventName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${ticket.id}.pdf`;

    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
      const pdfBlob = pdf.output('blob');
      const blobUrl = URL.createObjectURL(pdfBlob);
      
      // On essaie d'ouvrir dans un nouvel onglet, sinon on force sur l'actuel
      const newWin = window.open(blobUrl, '_blank');
      if (!newWin || newWin.closed || typeof newWin.closed === 'undefined') {
        window.location.href = blobUrl;
      }
      
      setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
    } else {
      pdf.save(filename);
    }

    return true;
  } catch (error) {
    console.error('Error generating PDF ticket:', error);
    return false;
  } finally {
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }
  }
};
