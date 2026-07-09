import jsPDF from 'jspdf';
import QRCode from 'qrcode';

export const generateMassTicketsPDF = async (
    tickets: { id: string, qrCode: string }[],
    eventName: string,
    categoryName: string,
    cols: number = 3
) => {
    try {
        const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        const pageWidth = 210;
        const pageHeight = 297;
        const margin = 10;

        const availableWidth = pageWidth - (margin * 2);
        const availableHeight = pageHeight - (margin * 2);

        // Determine cell dimensions based on column count
        let cellWidth = availableWidth / cols;
        let cellHeight = 85; // default for 3 cols
        let rows = 3;

        if (cols === 2) {
            cellHeight = 120;
            rows = 2;
        } else if (cols === 3) {
            cellHeight = 85;
            rows = 3;
        } else if (cols === 4) {
            cellHeight = 65;
            rows = 4;
        } else if (cols === 6) {
            cellHeight = 43;
            rows = 6;
        } else if (cols === 8) {
            cellHeight = 33;
            rows = 8;
        }

        const ticketsPerPage = cols * rows;

        for (let i = 0; i < tickets.length; i++) {
            const ticket = tickets[i];

            if (i > 0 && i % ticketsPerPage === 0) {
                pdf.addPage();
            }

            const pageIndex = i % ticketsPerPage;
            const colIndex = pageIndex % cols;
            const rowIndex = Math.floor(pageIndex / cols);

            // Calculate absolute x, y coordinates on the page
            const x = margin + (colIndex * cellWidth);
            const y = margin + (rowIndex * cellHeight);

            // Draw a light grey cell border
            pdf.setDrawColor(220, 224, 230);
            pdf.setLineWidth(0.2);
            pdf.rect(x + 1, y + 1, cellWidth - 2, cellHeight - 2);

            // Font configurations based on column layout
            let titleFontSize = 10;
            let catFontSize = 8;
            let textFontSize = 6;
            let idFontSize = 8;

            if (cols === 2) {
                titleFontSize = 12;
                catFontSize = 9;
                textFontSize = 7;
                idFontSize = 10;
            } else if (cols >= 4) {
                titleFontSize = 7;
                catFontSize = 6;
                textFontSize = 5;
                idFontSize = 6;
            }

            // Draw Event Title (centered)
            pdf.setTextColor(30, 41, 59); // Slate-800
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(titleFontSize);
            const cleanEventName = eventName.length > (cols === 2 ? 35 : cols === 3 ? 24 : 14)
                ? eventName.substring(0, cols === 2 ? 32 : cols === 3 ? 21 : 12) + '...'
                : eventName;
            pdf.text(cleanEventName, x + (cellWidth / 2), y + (cols === 2 ? 8 : cols === 3 ? 7 : 5), { align: 'center' });

            // Draw Category Badge
            const headerHeight = cols === 2 ? 18 : cols === 3 ? 15 : 11;
            const cleanCatName = categoryName.substring(0, cols === 2 ? 22 : cols === 3 ? 16 : 10);
            
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(catFontSize);
            const textWidth = pdf.getTextWidth(cleanCatName);
            const badgeWidth = textWidth + 4;
            const badgeHeight = catFontSize / 2 + 2;
            const badgeX = x + (cellWidth / 2) - (badgeWidth / 2);
            const badgeY = y + (cols === 2 ? 11 : cols === 3 ? 9 : 7);

            // Badge Background
            pdf.setFillColor(234, 88, 12); // Brand orange
            pdf.roundedRect(badgeX, badgeY, badgeWidth, badgeHeight, 1, 1, 'F');
            
            // Badge Text
            pdf.setTextColor(255, 255, 255);
            pdf.text(cleanCatName, x + (cellWidth / 2), badgeY + (badgeHeight / 2) + (catFontSize / 4) - 0.2, { align: 'center' });

            // Calculate dynamic size and position for QR Code
            const footerHeight = cols === 2 ? 14 : cols === 3 ? 12 : 9;
            const maxQrSize = Math.min(cellWidth - 8, cellHeight - headerHeight - footerHeight - 4);
            const qrSize = maxQrSize;
            const qrX = x + (cellWidth / 2) - (qrSize / 2);
            const qrY = y + headerHeight + ((cellHeight - headerHeight - footerHeight - qrSize) / 2);

            // Generate Local offline QR Code as PNG Base64 Data URL
            const qrDataUrl = await QRCode.toDataURL(ticket.qrCode, {
                margin: 1,
                errorCorrectionLevel: 'L',
                width: 180
            });

            pdf.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);

            // Draw Ticket Secret Code (small monospace)
            pdf.setTextColor(100, 116, 139); // Slate-500
            pdf.setFont('courier', 'normal');
            pdf.setFontSize(textFontSize);
            const displayCode = ticket.qrCode.substring(0, cols === 2 ? 35 : cols === 3 ? 24 : 14) + '...';
            pdf.text(displayCode, x + (cellWidth / 2), y + cellHeight - (cols === 2 ? 8 : cols === 3 ? 7 : 5), { align: 'center' });

            // Draw Ticket ID
            pdf.setTextColor(0, 0, 0);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(idFontSize);
            pdf.text(`ID: ${ticket.id.substring(0, 8).toUpperCase()}`, x + (cellWidth / 2), y + cellHeight - (cols === 2 ? 3 : cols === 3 ? 2.5 : 1.8), { align: 'center' });
        }

        const filename = `Babipass_Mass_Tickets_${eventName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`;
        pdf.save(filename);
        return true;
    } catch (error) {
        console.error("Error generating mass PDF:", error);
        return false;
    }
};
