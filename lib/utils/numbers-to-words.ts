// Convert numbers to Spanish words (Guatemalan format)
export function numberToWords(num: number): string {
  const ones = [
    '', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
    'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete',
    'dieciocho', 'diecinueve'
  ];
  
  const tens = [
    '', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta',
    'ochenta', 'noventa'
  ];
  
  const hundreds = [
    '', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos',
    'seiscientos', 'setecientos', 'ochocientos', 'novecientos'
  ];

  if (num === 0) return 'cero';
  if (num < 20) return ones[num];
  
  if (num < 100) {
    const ten = Math.floor(num / 10);
    const one = num % 10;
    if (one === 0) return tens[ten];
    if (ten === 1) return ones[num];
    return `${tens[ten]} y ${ones[one]}`;
  }
  
  if (num < 1000) {
    const hundred = Math.floor(num / 100);
    const remainder = num % 100;
    if (hundred === 1 && remainder === 0) return 'cien';
    if (remainder === 0) return hundreds[hundred];
    return `${hundreds[hundred]} ${numberToWords(remainder)}`;
  }
  
  if (num < 1000000) {
    const thousand = Math.floor(num / 1000);
    const remainder = num % 1000;
    let thousandWord = thousand === 1 ? 'mil' : `${numberToWords(thousand)} mil`;
    if (remainder === 0) return thousandWord;
    return `${thousandWord} ${numberToWords(remainder)}`;
  }
  
  if (num < 1000000000) {
    const million = Math.floor(num / 1000000);
    const remainder = num % 1000000;
    let millionWord = million === 1 ? 'un millón' : `${numberToWords(million)} millones`;
    if (remainder === 0) return millionWord;
    return `${millionWord} ${numberToWords(remainder)}`;
  }

  if (num < 1000000000000) {
    const billions = Math.floor(num / 1000000000);
    const remainder = num % 1000000000;
    let billionWord = billions === 1 ? 'mil millones' : `${numberToWords(billions)} mil millones`;
    if (remainder === 0) return billionWord;
    return `${billionWord} ${numberToWords(remainder)}`;
  }

  if (num < 1000000000000000) {
    const trillions = Math.floor(num / 1000000000000);
    const remainder = num % 1000000000000;
    let trillionWord = trillions === 1 ? 'un billón' : `${numberToWords(trillions)} billones`;
    if (remainder === 0) return trillionWord;
    return `${trillionWord} ${numberToWords(remainder)}`;
  }
  
  return num.toString();
}

const monthNames: Record<string, string> = {
  '01': 'enero', '02': 'febrero', '03': 'marzo', '04': 'abril',
  '05': 'mayo', '06': 'junio', '07': 'julio', '08': 'agosto',
  '09': 'septiembre', '10': 'octubre', '11': 'noviembre', '12': 'diciembre',
  'enero': 'enero', 'febrero': 'febrero', 'marzo': 'marzo', 'abril': 'abril',
  'mayo': 'mayo', 'junio': 'junio', 'julio': 'julio', 'agosto': 'agosto',
  'septiembre': 'septiembre', 'octubre': 'octubre', 'noviembre': 'noviembre', 'diciembre': 'diciembre'
};

export function dateToWords(dia: string, mes: string, ano: string): string {
  const dayNum = parseInt(dia);
  const yearNum = parseInt(ano);
  
  if (isNaN(dayNum) || isNaN(yearNum)) {
    return `${dia} de ${mes} de ${ano}`;
  }
  
  const dayWords = numberToWords(dayNum);
  const monthName = monthNames[mes.toLowerCase()] || mes.toLowerCase();
  const yearWords = numberToWords(yearNum);
  
  return `${dayWords} de ${monthName} de ${yearWords}`;
}

export function formatDateNumeric(dia: string, mes: string, ano: string): string {
  const day = dia.padStart(2, '0');
  const month = mes.length === 1 ? mes.padStart(2, '0') : mes;
  return `${day}/${month}/${ano}`;
}

