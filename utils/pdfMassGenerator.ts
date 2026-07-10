import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import JSZip from 'jszip';

/**
 * Nettoie une chaîne de caractères pour éliminer les émojis et normaliser les accents français
 * afin d'éviter tout caractère corrompu (comme des Ø=Ý%& ou des &) dans jsPDF.
 */
export const cleanTextForPDF = (text: string): string => {
    if (!text) return '';
    // 1. Supprime les émojis et les paires de substitution
    let cleaned = text.replace(/[\uD800-\uDFFF]./g, '');
    cleaned = cleaned.replace(/[\u{1F300}-\u{1F9FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '');
    
    // 2. Supprime les accents français (normalisation NFD)
    cleaned = cleaned.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    return cleaned.trim();
};

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

        // Nettoyer les textes
        const sanitizedEventName = cleanTextForPDF(eventName);
        const sanitizedCatName = cleanTextForPDF(categoryName);

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
            const cleanEventName = sanitizedEventName.length > (cols === 2 ? 35 : cols === 3 ? 24 : 14)
                ? sanitizedEventName.substring(0, cols === 2 ? 32 : cols === 3 ? 21 : 12) + '...'
                : sanitizedEventName;
            pdf.text(cleanEventName, x + (cellWidth / 2), y + (cols === 2 ? 8 : cols === 3 ? 7 : 5), { align: 'center' });

            // Draw Category Badge
            const headerHeight = cols === 2 ? 18 : cols === 3 ? 15 : 11;
            const cleanCatName = sanitizedCatName.substring(0, cols === 2 ? 22 : cols === 3 ? 16 : 10);
            
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

        const filename = `Babipass_Mass_Tickets_${sanitizedEventName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`;
        pdf.save(filename);
        return true;
    } catch (error) {
        console.error("Error generating mass PDF:", error);
        return false;
    }
};

/**
 * Génère un fichier ZIP contenant chaque ticket sous forme d'image JPG compressée.
 * Si qrOnly est activé, génère uniquement le QR Code brut sous format PNG aux dimensions spécifiées.
 */
export const generateMassTicketsZipJPG = async (
    tickets: { id: string, qrCode: string }[],
    eventName: string,
    categoryName: string,
    qrOnly: boolean = false,
    qrSize: number = 200
) => {
    try {
        const zip = new JSZip();
        
        const sanitizedEventName = cleanTextForPDF(eventName);
        const sanitizedCatName = cleanTextForPDF(categoryName);
        
        // Dimensions d'une carte ticket haute définition (600 x 850)
        const width = 600;
        const height = 850;
        
        let canvas: HTMLCanvasElement | null = null;
        let ctx: CanvasRenderingContext2D | null = null;
        
        if (!qrOnly) {
            canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            ctx = canvas.getContext('2d');
            if (!ctx) throw new Error("Impossible de créer le contexte 2D du canvas");
        }

        for (let i = 0; i < tickets.length; i++) {
            const ticket = tickets[i];
            
            if (qrOnly) {
                // Générer le QR Code à la taille spécifiée (85, 200, 500, 800)
                // Pour assurer une netteté absolue (notamment sur le format 85x85), nous sur-échantillonnons à 512px minimum.
                const exportWidth = Math.max(qrSize * 6, 512);
                const qrDataUrl = await QRCode.toDataURL(ticket.qrCode, {
                    margin: 2,
                    errorCorrectionLevel: 'M',
                    width: exportWidth
                });
                
                const response = await fetch(qrDataUrl);
                const blob = await response.blob();
                
                const filename = `qrcode_${ticket.id.toUpperCase()}_${qrSize}x${qrSize}.png`;
                zip.file(filename, blob);
            } else {
                // Fond blanc
                ctx!.fillStyle = '#FFFFFF';
                ctx!.fillRect(0, 0, width, height);
                
                // Bordure grise
                ctx!.strokeStyle = '#E2E8F0'; // Slate-200
                ctx!.lineWidth = 6;
                ctx!.strokeRect(3, 3, width - 6, height - 6);
                
                // Titre de l'événement
                ctx!.fillStyle = '#1E293B'; // Slate-800
                ctx!.font = 'bold 24px sans-serif';
                ctx!.textAlign = 'center';
                ctx!.textBaseline = 'top';
                
                let displayTitle = sanitizedEventName;
                if (displayTitle.length > 30) {
                    displayTitle = displayTitle.substring(0, 27) + '...';
                }
                ctx!.fillText(displayTitle, width / 2, 45);
                
                // Badge Catégorie
                ctx!.font = 'bold 18px sans-serif';
                const textWidth = ctx!.measureText(sanitizedCatName).width;
                const badgeWidth = textWidth + 24;
                const badgeHeight = 36;
                const badgeX = (width / 2) - (badgeWidth / 2);
                const badgeY = 95;
                
                ctx!.fillStyle = '#EA580C'; // Orange
                ctx!.beginPath();
                ctx!.roundRect ? ctx!.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 6) : ctx!.rect(badgeX, badgeY, badgeWidth, badgeHeight);
                ctx!.fill();
                
                ctx!.fillStyle = '#FFFFFF';
                ctx!.fillText(sanitizedCatName, width / 2, badgeY + 8);
                
                // QR Code
                const qrDataUrl = await QRCode.toDataURL(ticket.qrCode, {
                    margin: 2,
                    errorCorrectionLevel: 'M',
                    width: 512
                });
                
                const qrImg = new Image();
                qrImg.src = qrDataUrl;
                await new Promise((resolve) => {
                    qrImg.onload = resolve;
                });
                
                const qrSizeImg = 420;
                const qrX = (width / 2) - (qrSizeImg / 2);
                const qrY = 165;
                ctx!.drawImage(qrImg, qrX, qrY, qrSizeImg, qrSizeImg);
                
                // Code secret du ticket (Monospace)
                ctx!.fillStyle = '#64748B'; // Slate-500
                ctx!.font = '16px monospace';
                let displayCode = ticket.qrCode;
                if (displayCode.length > 38) {
                    displayCode = displayCode.substring(0, 35) + '...';
                }
                ctx!.fillText(displayCode, width / 2, 630);
                
                // ID du ticket en bas
                ctx!.fillStyle = '#000000';
                ctx!.font = 'bold 22px sans-serif';
                ctx!.fillText(`ID: ${ticket.id.toUpperCase()}`, width / 2, 770);
                
                // Conversion en Blob JPG
                const blob = await new Promise<Blob | null>((resolve) => {
                    canvas!.toBlob((b) => resolve(b), 'image/jpeg', 0.85);
                });
                
                if (blob) {
                    const filename = `ticket_${ticket.id.toUpperCase()}.jpg`;
                    zip.file(filename, blob);
                }
            }
        }
        
        // Génération du fichier ZIP
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const prefix = qrOnly ? 'QRCodes_Bruts_' : 'Tickets_';
        const zipFilename = `Babipass_${prefix}${sanitizedEventName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.zip`;
        
        // Déclencher le téléchargement du ZIP
        const link = document.createElement('a');
        link.href = URL.createObjectURL(zipBlob);
        link.download = zipFilename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        return true;
    } catch (error) {
        console.error("Error generating mass ZIP:", error);
        return false;
    }
};
