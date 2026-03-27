import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export const generateMassTicketsPDF = async (
    tickets: { id: string, qrCode: string }[],
    eventName: string,
    categoryName: string,
    cols: number = 3
) => {
    // 1. Create a hidden DOM element to render the grid
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '0';
    // A4 dimensions at 96 DPI are approximately 794x1123 pixels
    container.style.width = '794px';
    container.style.backgroundColor = 'white';
    container.style.display = 'flex';
    container.style.flexWrap = 'wrap';
    container.style.justifyContent = 'flex-start';
    container.style.alignContent = 'flex-start';
    container.style.padding = '20px'; // page margin
    container.style.boxSizing = 'border-box';

    const qrMargin = 10;
    // Calculate item width taking padding and margins into account
    const containerInnerWidth = 794 - 40; // 20px padding left/right
    const itemWidth = Math.floor((containerInnerWidth / cols) - (qrMargin * 2));

    // Build the grid of QR codes
    const gridHtml = tickets.map((t, index) => {
        const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(t.qrCode)}`;

        return `
      <div style="width: ${itemWidth}px; margin: ${qrMargin}px; padding: 10px; border: 1px dashed #ccc; text-align: center; box-sizing: border-box; page-break-inside: avoid; display: flex; flex-direction: column; align-items: center; justify-content: center;">
        <p style="margin: 0 0 5px 0; font-size: ${cols > 4 ? '8px' : '10px'}; font-weight: bold; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%;">
          ${eventName}
        </p>
        <div style="background: #f1f5f9; padding: 2px 5px; border-radius: 4px; display: inline-block; margin-bottom: 8px;">
           <span style="font-size: ${cols > 4 ? '7px' : '9px'}; font-weight: bold; color: #ea580c;">${categoryName}</span>
        </div>
        
        <img src="${qrCodeUrl}" style="width: 100%; max-width: 150px; aspect-ratio: 1/1; object-fit: contain; display: block; margin: 0 auto;" crossorigin="anonymous" />
        
        <p style="margin: 8px 0 0 0; font-size: ${cols > 4 ? '6px' : '7px'}; color: #64748b; font-family: monospace; word-break: break-all; width: 100%;">
          ${t.qrCode.substring(0, 40)}...
        </p>
        <p style="margin: 2px 0 0 0; font-size: ${cols > 4 ? '6px' : '8px'}; font-weight: bold; color: #000;">
          ID: ${t.id.substring(0, 8).toUpperCase()}
        </p>
      </div>
    `;
    }).join('');

    container.innerHTML = gridHtml;
    document.body.appendChild(container);

    try {
        // 2. Wait for all images to load
        const images = Array.from(container.querySelectorAll('img'));
        await Promise.all(images.map(img => {
            return new Promise((resolve) => {
                if (img.complete) resolve(true);
                img.onload = () => resolve(true);
                img.onerror = () => resolve(true);
            });
        }));

        // 3. Render container to canvas
        const canvas = await html2canvas(container, {
            scale: 2, // High resolution for printing
            useCORS: true,
            backgroundColor: '#ffffff',
            logging: false,
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.95);

        // 4. Create PDF Document (A4)
        const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

        // Handle multipage if content is taller than an A4 page
        const pageHeight = pdf.internal.pageSize.getHeight();
        let heightLeft = pdfHeight;
        let position = 0;

        pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfHeight);
        heightLeft -= pageHeight;

        while (heightLeft >= 0) {
            position = heightLeft - pdfHeight;
            pdf.addPage();
            pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfHeight);
            heightLeft -= pageHeight;
        }

        // 5. Download
        const filename = `Babipass_Mass_Tickets_${eventName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`;
        pdf.save(filename);

        return true;
    } catch (error) {
        console.error("Error generating mass PDF:", error);
        return false;
    } finally {
        if (document.body.contains(container)) {
            document.body.removeChild(container);
        }
    }
};
