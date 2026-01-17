'use client';

import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import { dateToWords, numberToWords } from '@/lib/utils/numbers-to-words';
import {
  detectLegalizacionDocType,
  extractLegalizacionFields,
  LegalizacionDocType,
  LegalizacionFields,
} from '@/lib/utils/legalizacion';

const LETTER_WIDTH = 612; // 8.5 * 72
const LETTER_HEIGHT = 792; // 11 * 72
const LEGAL_WIDTH = 612; // 8.5 * 72
const LEGAL_HEIGHT = 936; // 13 * 72
const LEGAL_MARGIN_X = 36;
const LEGAL_BOTTOM_SPACE = 144; // 2 inches

type DocAnalysis = {
  text: string;
  detectedType: LegalizacionDocType | 'unknown';
  reason?: string;
};

type PageInfo = {
  width: number;
  height: number;
  widthInches?: number;
  heightInches?: number;
  isLetterSize: boolean;
  isPortrait: boolean;
  needsRotation: boolean;
  aspectRatio?: number;
};

type FormValues = {
  date: string;
  cui: string;
  nombreCompleto: string;
  nombreEntidad: string;
  numeroRegistro: string;
  folio: string;
  libro: string;
};

const emptyForm: FormValues = {
  date: '',
  cui: '',
  nombreCompleto: '',
  nombreEntidad: '',
  numeroRegistro: '',
  folio: '',
  libro: '',
};

export default function LegalizacionPage() {
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<DocAnalysis | null>(null);
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);
  const [docType, setDocType] = useState<LegalizacionDocType | null>(null);
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [showVariablesModal, setShowVariablesModal] = useState(false);
  const [formValues, setFormValues] = useState<FormValues>(emptyForm);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);

  const handleFileSelected = async (selected: File) => {
    setFile(selected);
    setOutputUrl(null);
    setError(null);
    setAnalysis(null);
    setDocType(null);
    setFormValues(emptyForm);

    await inspectDocument(selected);
    await analyzeDocument(selected);
  };

  const analyzeDocument = async (selected: File) => {
    setIsAnalyzing(true);
    try {
      const formData = new FormData();
      formData.append('file', selected);

      const response = await fetch('/api/legalizacion/analyze', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'No se pudo analizar el documento');
      }

      const data = await response.json();
      const detection = detectLegalizacionDocType(data.text || '');
      setAnalysis({
        text: data.text || '',
        detectedType: detection.type,
        reason: detection.reason,
      });
      setDocType(detection.type === 'unknown' ? null : detection.type);
      setShowTypeModal(true);
    } catch (err: any) {
      setError(err?.message || 'Error al analizar el documento');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const inspectDocument = async (selected: File) => {
    if (selected.type === 'application/pdf') {
      const arrayBuffer = await selected.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const firstPage = pdfDoc.getPages()[0];
      const { width, height } = firstPage.getSize();
      const widthInches = width / 72;
      const heightInches = height / 72;
      const isPortrait = height >= width;
      const isLetterSize = isCloseToLetter(widthInches, heightInches);

      setPageInfo({
        width,
        height,
        widthInches,
        heightInches,
        isLetterSize,
        isPortrait,
        needsRotation: width > height,
      });
      return;
    }

    const bitmap = await createImageBitmap(selected);
    const aspectRatio = bitmap.width / bitmap.height;
    const isPortrait = bitmap.height >= bitmap.width;
    const isLetterSize = isCloseToAspect(aspectRatio, 8.5 / 11);

    setPageInfo({
      width: bitmap.width,
      height: bitmap.height,
      isLetterSize,
      isPortrait,
      needsRotation: bitmap.width > bitmap.height,
      aspectRatio,
    });
  };

  const handleConfirmDocType = () => {
    if (!analysis) return;

    const finalType = docType || analysis.detectedType;
    if (!finalType || finalType === 'unknown') {
      setError('Selecciona un tipo de documento válido');
      return;
    }

    const extracted = extractLegalizacionFields(analysis.text, finalType);
    setFormValues((prev) => ({
      ...prev,
      ...valuesFromExtraction(extracted),
      date: prev.date || new Date().toISOString().slice(0, 10),
    }));

    setShowTypeModal(false);
    setShowVariablesModal(true);
  };

  const handleGenerate = async () => {
    if (!file || !docType) return;
    setError(null);

    const validation = validateRequiredFields(docType, formValues);
    if (!validation.valid) {
      setError(validation.message || 'Completa los datos requeridos.');
      return;
    }

    setIsGenerating(true);
    try {
      const paragraph = buildLegalizationText(docType, formValues);
      const pdfBytes = await generateLegalizationPdf(file, pageInfo, paragraph);
      const blob = new Blob([Uint8Array.from(pdfBytes)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setOutputUrl(url);
    } catch (err: any) {
      setError(err?.message || 'No se pudo generar el PDF');
    } finally {
      setIsGenerating(false);
    }
  };

  const docTypeLabel = useMemo(() => {
    if (!docType) return 'Sin confirmar';
    return docType === 'dpi'
      ? 'Documento Personal de Identificación (DPI)'
      : docType === 'patente_empresa'
        ? 'Patente de Comercio de Empresa'
        : 'Patente de Comercio de Sociedad';
  }, [docType]);

  const handleInputChange = useCallback(
    (field: keyof FormValues, value: string) => {
      setFormValues((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">Legalización de Documentos</h1>
        <p className="text-gray-600">
          Carga un documento para generar la hoja legalizada con sus variables.
        </p>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6 space-y-6">
        <div className="border-l-4 border-lapis pl-4 py-2">
          <div className="flex items-center gap-2 mb-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-lapis text-white font-bold text-sm">1</span>
            <label className="block text-sm font-medium text-gray-700">Subir documento</label>
          </div>
          <FilePicker
            disabled={isAnalyzing || isGenerating}
            file={file}
            onFileSelected={handleFileSelected}
          />
        </div>

        <div className="border-l-4 border-lapis pl-4 py-2">
          <div className="flex items-center gap-2 mb-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-lapis text-white font-bold text-sm">2</span>
            <label className="block text-sm font-medium text-gray-700">Tipo detectado</label>
          </div>
          {isAnalyzing ? (
            <p className="text-sm text-gray-500">Analizando documento...</p>
          ) : analysis ? (
            <div className="space-y-2">
              <p className="text-sm text-gray-700">
                Detectado: <span className="font-medium">{docTypeLabel}</span>
              </p>
              {analysis.reason && (
                <p className="text-xs text-gray-500">Motivo: {analysis.reason}</p>
              )}
              <Button variant="secondary" onClick={() => setShowTypeModal(true)}>
                Confirmar o cambiar
              </Button>
            </div>
          ) : (
            <p className="text-sm text-gray-500">Sube un documento para detectar el tipo.</p>
          )}
        </div>

        <div className="border-l-4 border-lapis pl-4 py-2">
          <div className="flex items-center gap-2 mb-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-lapis text-white font-bold text-sm">3</span>
            <label className="block text-sm font-medium text-gray-700">Tamaño y orientación</label>
          </div>
          {pageInfo ? (
            <div className="space-y-1 text-sm text-gray-700">
              {pageInfo.widthInches && pageInfo.heightInches ? (
                <p>
                  Tamaño detectado: {pageInfo.widthInches.toFixed(2)} in x {pageInfo.heightInches.toFixed(2)} in
                </p>
              ) : (
                <p>
                  Relación de aspecto: {pageInfo.aspectRatio?.toFixed(3)} (objetivo 0.773)
                </p>
              )}
              <p>
                Orientación: {pageInfo.isPortrait ? 'Vertical' : 'Horizontal'}{' '}
                {pageInfo.needsRotation ? '(se corregirá automáticamente)' : ''}
              </p>
              <p>
                Carta 8.5x11: {pageInfo.isLetterSize ? 'Sí' : 'No (verifica el tamaño antes de legalizar)'}
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-500">Esperando documento...</p>
          )}
        </div>

        <div className="border-l-4 border-lapis pl-4 py-2">
          <div className="flex items-center gap-2 mb-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-lapis text-white font-bold text-sm">4</span>
            <label className="block text-sm font-medium text-gray-700">Variables de legalización</label>
          </div>
          {docType ? (
            <Button variant="secondary" onClick={() => setShowVariablesModal(true)}>
              Revisar variables
            </Button>
          ) : (
            <p className="text-sm text-gray-500">Confirma el tipo de documento para continuar.</p>
          )}
        </div>

        <div className="border-l-4 border-lapis pl-4 py-2">
          <div className="flex items-center gap-2 mb-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-lapis text-white font-bold text-sm">5</span>
            <label className="block text-sm font-medium text-gray-700">Generar legalización</label>
          </div>
          <Button
            disabled={!file || !docType || isGenerating}
            onClick={handleGenerate}
          >
            {isGenerating ? 'Generando...' : 'Generar PDF legalizado'}
          </Button>
          {outputUrl && (
            <div className="pt-3">
              <a
                href={outputUrl}
                download="legalizacion.pdf"
                className="text-sm text-lapis underline"
              >
                Descargar PDF legalizado
              </a>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-md p-4 text-sm">
          {error}
        </div>
      )}

      {showTypeModal && (
        <Modal title="Confirmar tipo de documento" onClose={() => setShowTypeModal(false)}>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Selecciona el tipo correcto para continuar con la legalización.
            </p>
            <div className="space-y-2">
              {[
                { value: 'dpi', label: 'Documento Personal de Identificación (DPI)' },
                { value: 'patente_empresa', label: 'Patente de Comercio de Empresa' },
                { value: 'patente_sociedad', label: 'Patente de Comercio de Sociedad' },
              ].map((option) => (
                <label key={option.value} className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="radio"
                    name="docType"
                    value={option.value}
                    checked={docType === option.value}
                    onChange={() => setDocType(option.value as LegalizacionDocType)}
                  />
                  {option.label}
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowTypeModal(false)}>
                Cancelar
              </Button>
              <Button onClick={handleConfirmDocType}>Confirmar</Button>
            </div>
          </div>
        </Modal>
      )}

      {showVariablesModal && docType && (
        <Modal title="Variables de legalización" onClose={() => setShowVariablesModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-gray-700 block mb-1">Fecha</label>
              <input
                type="date"
                value={formValues.date}
                onChange={(e) => handleInputChange('date', e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>

            {docType === 'dpi' ? (
              <>
                <div>
                  <label className="text-sm text-gray-700 block mb-1">Código Único de Identificación (CUI)</label>
                  <input
                    value={formValues.cui}
                    onChange={(e) => handleInputChange('cui', e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-700 block mb-1">Nombre completo</label>
                  <input
                    value={formValues.nombreCompleto}
                    onChange={(e) => handleInputChange('nombreCompleto', e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="text-sm text-gray-700 block mb-1">
                    {docType === 'patente_empresa' ? 'Nombre de la Empresa Mercantil' : 'Nombre de la Sociedad'}
                  </label>
                  <input
                    value={formValues.nombreEntidad}
                    onChange={(e) => handleInputChange('nombreEntidad', e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-700 block mb-1">Número de registro</label>
                  <input
                    value={formValues.numeroRegistro}
                    onChange={(e) => handleInputChange('numeroRegistro', e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm text-gray-700 block mb-1">Folio</label>
                    <input
                      value={formValues.folio}
                      onChange={(e) => handleInputChange('folio', e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-700 block mb-1">Libro</label>
                    <input
                      value={formValues.libro}
                      onChange={(e) => handleInputChange('libro', e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              </>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowVariablesModal(false)}>
                Cerrar
              </Button>
              <Button onClick={() => setShowVariablesModal(false)}>Guardar</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function FilePicker({
  disabled,
  file,
  onFileSelected,
}: {
  disabled: boolean;
  file: File | null;
  onFileSelected: (file: File) => void;
}) {
  return (
    <div className="border-2 border-dashed rounded-lg p-6 text-center">
      <input
        type="file"
        accept=".pdf,.png,.jpg,.jpeg"
        disabled={disabled}
        onChange={(e) => {
          const selected = e.target.files?.[0];
          if (selected) {
            onFileSelected(selected);
          }
        }}
        className="hidden"
        id="legalizacion-file-input"
      />
      <label
        htmlFor="legalizacion-file-input"
        className={`cursor-pointer text-sm ${disabled ? 'text-gray-400' : 'text-lapis'}`}
      >
        {file ? `Archivo seleccionado: ${file.name}` : 'Seleccionar archivo'}
      </label>
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function isCloseToLetter(width: number, height: number): boolean {
  const portraitMatch = Math.abs(width - 8.5) < 0.2 && Math.abs(height - 11) < 0.2;
  const landscapeMatch = Math.abs(width - 11) < 0.2 && Math.abs(height - 8.5) < 0.2;
  return portraitMatch || landscapeMatch;
}

function isCloseToAspect(actual: number, target: number): boolean {
  return Math.abs(actual - target) < 0.05;
}

function valuesFromExtraction(extracted: LegalizacionFields): Partial<FormValues> {
  if (extracted.type === 'dpi') {
    return {
      cui: extracted.cui,
      nombreCompleto: extracted.nombreCompleto,
    };
  }

  return {
    nombreEntidad: extracted.nombreEntidad,
    numeroRegistro: extracted.numeroRegistro,
    folio: extracted.folio,
    libro: extracted.libro,
  };
}

function validateRequiredFields(docType: LegalizacionDocType, values: FormValues): { valid: boolean; message?: string } {
  if (!values.date) {
    return { valid: false, message: 'Ingresa la fecha de legalización.' };
  }

  if (docType === 'dpi') {
    if (!values.cui.trim() || !values.nombreCompleto.trim()) {
      return { valid: false, message: 'Completa CUI y nombre completo.' };
    }
  } else {
    if (!values.nombreEntidad.trim() || !values.numeroRegistro.trim() || !values.folio.trim() || !values.libro.trim()) {
      return { valid: false, message: 'Completa nombre, número de registro, folio y libro.' };
    }
  }

  return { valid: true };
}

function buildLegalizationText(docType: LegalizacionDocType, values: FormValues): string {
  const [year, month, day] = values.date.split('-');
  const dateWords = dateToWords(day, month, year);

  if (docType === 'dpi') {
    const cuiDigits = onlyDigits(values.cui);
    const cuiWords = numberToWords(Number(cuiDigits));
    const nombre = values.nombreCompleto.toUpperCase();

    return [
      'En la ciudad de Guatemala, el día ' + dateWords + ', como Notaria, DOY FE de que la',
      'presente hoja de papel de fotocopia ES AUTÉNTICA, por haber sido reproducida de su original el día de hoy en mi presencia, la cual reproduce DOCUMENTO PERSONAL DE IDENTIFICACIÓN, (DPI), con Código Único de Identificación ' +
        `${cuiWords} (${cuiDigits}) extendido por el Registro Nacional de las Personas de la República de Guatemala, correspondiente a ${nombre}. En fe de lo anterior, firmo y sello la hoja de papel fotocopia que por medio del presente acto legalizo.`,
      '',
      'POR MÍ Y ANTE MÍ',
    ].join('\n');
  }

  const nombreEntidad = values.nombreEntidad.toUpperCase();
  const numeroRegistroDigits = onlyDigits(values.numeroRegistro);
  const folioDigits = onlyDigits(values.folio);
  const libroDigits = onlyDigits(values.libro);

  const numeroRegistroWords = numberToWords(Number(numeroRegistroDigits));
  const folioWords = numberToWords(Number(folioDigits));
  const libroWords = numberToWords(Number(libroDigits));

  if (docType === 'patente_empresa') {
    return [
      'En la ciudad de Guatemala, el día ' + dateWords + ', como Notaria, DOY FE de que la',
      'presente hoja de papel de fotocopia ES AUTÉNTICA, por haber sido reproducida de su original el día de hoy en mi presencia, la cual reproduce la Patente de Comercio de Empresa de la empresa mercantil ' +
        `${nombreEntidad}, con número de registro ${numeroRegistroWords} (${numeroRegistroDigits}), folio ${folioWords} (${folioDigits}) y libro ${libroWords} (${libroDigits}) de Empresas Mercantiles. En fe de lo anterior, firmo y sello la hoja de papel fotocopia que por medio del presente acto legalizo.`,
      '',
      'POR MI Y ANTE MI',
    ].join('\n');
  }

  return [
    'En la ciudad de Guatemala, el día ' + dateWords + ', como Notaria, DOY FE',
    'de que la presente hoja de papel de fotocopia ES AUTÉNTICA, por haber sido reproducida de',
    'su original el día de hoy en mi presencia, la cual reproduce la Patente de Comercio de',
    `Sociedad de ${nombreEntidad}, con número de registro ${numeroRegistroWords} (${numeroRegistroDigits}), folio ${folioWords} (${folioDigits}) y libro ${libroWords} (${libroDigits}) de Empresas Mercantiles. En fe de lo anterior, firmo y sello la hoja de papel fotocopia que por medio del presente acto legalizo.`,
    '',
    'POR MI Y ANTE MI',
  ].join('\n');
}

async function generateLegalizationPdf(
  file: File,
  pageInfo: PageInfo | null,
  paragraphText: string
): Promise<Uint8Array> {
  const outputPdf = await PDFDocument.create();
  const outputPage = outputPdf.addPage([LEGAL_WIDTH, LEGAL_HEIGHT]);

  const sourceBytes = await file.arrayBuffer();

  if (file.type === 'application/pdf') {
    const sourcePdf = await PDFDocument.load(sourceBytes);
    const sourcePage = sourcePdf.getPages()[0];
    const rotatedPage = pageInfo?.needsRotation;

    if (rotatedPage) {
      const { width, height } = sourcePage.getSize();
      sourcePage.setRotation(degrees(90));
      sourcePage.setSize(height, width);
      const pageAny = sourcePage as any;
      if (pageAny.translateContent) {
        pageAny.translateContent(height, 0);
      }
    }

    const embeddedPage = await outputPdf.embedPage(sourcePage);
    const scale = LETTER_WIDTH / embeddedPage.width;
    const scaledHeight = embeddedPage.height * scale;
    const yPosition = LEGAL_HEIGHT - scaledHeight;

    outputPage.drawPage(embeddedPage, {
      x: 0,
      y: yPosition,
      xScale: scale,
      yScale: scale,
    });
  } else {
    const imageBytes = await prepareImageBytes(file, pageInfo?.needsRotation);
    const embed = file.type === 'image/png'
      ? await outputPdf.embedPng(imageBytes)
      : await outputPdf.embedJpg(imageBytes);
    const scale = LETTER_WIDTH / embed.width;
    const scaledHeight = embed.height * scale;
    const yPosition = LEGAL_HEIGHT - scaledHeight;

    outputPage.drawImage(embed, {
      x: 0,
      y: yPosition,
      width: LETTER_WIDTH,
      height: scaledHeight,
    });
  }

  const font = await outputPdf.embedFont(StandardFonts.TimesRoman);
  const fontSize = fitFontSize(paragraphText, font, LETTER_WIDTH - LEGAL_MARGIN_X * 2, LEGAL_BOTTOM_SPACE - 12);
  const lines = wrapText(paragraphText, font, fontSize, LETTER_WIDTH - LEGAL_MARGIN_X * 2);
  const lineHeight = fontSize * 1.25;
  let currentY = LEGAL_BOTTOM_SPACE - 8;

  for (const line of lines) {
    if (line === '') {
      currentY -= lineHeight;
      continue;
    }

    outputPage.drawText(line, {
      x: LEGAL_MARGIN_X,
      y: currentY,
      size: fontSize,
      font,
      color: rgb(0, 0, 0),
    });
    currentY -= lineHeight;
  }

  return outputPdf.save();
}

async function prepareImageBytes(file: File, rotate?: boolean): Promise<Uint8Array> {
  if (!rotate) {
    return new Uint8Array(await file.arrayBuffer());
  }

  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.height;
  canvas.height = bitmap.width;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('No se pudo preparar la imagen');
  }
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);

  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b as Blob), 'image/png'));
  const buffer = await blob.arrayBuffer();
  return new Uint8Array(buffer);
}

function wrapText(text: string, font: any, size: number, maxWidth: number): string[] {
  const paragraphs = text.split('\n');
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      lines.push('');
      continue;
    }

    const words = paragraph.split(' ');
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const width = font.widthOfTextAtSize(testLine, size);
      if (width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }
  }

  return lines;
}

function fitFontSize(text: string, font: any, maxWidth: number, maxHeight: number): number {
  for (let size = 10; size >= 7; size -= 1) {
    const lines = wrapText(text, font, size, maxWidth);
    const height = lines.length * size * 1.25;
    if (height <= maxHeight) {
      return size;
    }
  }

  return 7;
}

function onlyDigits(value: string): string {
  return value.replace(/[^\d]/g, '');
}
