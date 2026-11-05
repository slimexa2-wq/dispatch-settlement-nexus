export type ColumnMapping = {
  originalHeader: string;
  mappedField: string | null;
  confidence: number;
};

export type SemanticFingerprintResult = {
  mappings: ColumnMapping[];
  divisor: 10 | 11 | 12 | null;
};

export function identifyTableFingerprint(
  headers: string[],
  rows?: string[][]
): SemanticFingerprintResult {
  const mappings: ColumnMapping[] = headers.map(header => {
    let mappedField: string | null = null;
    let confidence = 0;

    const normalizedHeader = header.toLowerCase().replace(/[\s_*-]/g, "");

    if (normalizedHeader.includes("身份证") || normalizedHeader.includes("证件号")) {
      mappedField = "idCard";
      confidence = 0.9;
    } else if (normalizedHeader.includes("姓名") || normalizedHeader.includes("名字")) {
      mappedField = "name";
      confidence = 0.9;
    } else if (normalizedHeader.includes("工时") || normalizedHeader.includes("小时") || normalizedHeader.includes("出勤时")) {
      mappedField = "hours";
      confidence = 0.8;
    } else if (normalizedHeader.includes("天数") || normalizedHeader.includes("出勤天") || normalizedHeader.includes("考勤天")) {
      mappedField = "days";
      confidence = 0.8;
    } else if (normalizedHeader.includes("项目") || normalizedHeader.includes("工厂")) {
      mappedField = "projectName";
      confidence = 0.7;
    } else if (normalizedHeader.includes("部门") || normalizedHeader.includes("班组")) {
      mappedField = "department";
      confidence = 0.6;
    } else if (normalizedHeader.includes("考勤") || normalizedHeader.includes("工资")) {
       mappedField = "salaryOrAttendance";
       confidence = 0.5;
    }

    return { originalHeader: header, mappedField, confidence };
  });

  let divisor: 10 | 11 | 12 | null = null;

  if (rows && rows.length > 0) {
    const hoursIndex = mappings.findIndex(m => m.mappedField === "hours");
    const daysIndex = mappings.findIndex(m => m.mappedField === "days");

    if (hoursIndex !== -1 && daysIndex !== -1) {
      for (const row of rows) {
        const hoursStr = row[hoursIndex];
        const daysStr = row[daysIndex];
        if (hoursStr && daysStr) {
          const hours = parseFloat(hoursStr);
          const days = parseFloat(daysStr);

          if (!isNaN(hours) && !isNaN(days) && days > 0) {
            const calculatedDivisor = hours / days;

            if (Math.abs(calculatedDivisor - 10) < 0.1) divisor = 10;
            else if (Math.abs(calculatedDivisor - 11) < 0.1) divisor = 11;
            else if (Math.abs(calculatedDivisor - 12) < 0.1) divisor = 12;

            if (divisor !== null) break;
          }
        }
      }
    }
  }

  return { mappings, divisor };
}
