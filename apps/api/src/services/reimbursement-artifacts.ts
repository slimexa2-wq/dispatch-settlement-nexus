import * as XLSX from "xlsx";
import { AppError } from "../errors.js";

export type ReimbursementWorkbookInput = {
  code: string;
  title: string;
  status: string;
  applicantName: string;
  branchName?: string | null;
  organizationUnitName?: string | null;
  totalPaymentCents: number;
  totalInvoiceCents: number;
  invoiceExcessCents: number;
  lines: Array<{
    sequence: number;
    expenseDate: Date;
    category: string;
    description: string;
    payeeName?: string | null;
    paymentCents: number;
    invoiceCents: number;
  }>;
};

export function createReimbursementWorkbook(
  input: ReimbursementWorkbookInput
): Buffer {
  const rows: Array<Array<string | number>> = [
    ["祥能人力资源综合信息系统 - 报销单"],
    ["报销编号", input.code, "报销标题", input.title],
    ["申请人", input.applicantName, "当前状态", input.status],
    ["分公司", input.branchName ?? "—", "部门", input.organizationUnitName ?? "—"],
    [],
    ["序号", "费用日期", "费用类别", "费用说明", "收款人", "付款金额（元）", "发票金额（元）", "票额差（元）"],
    ...[...input.lines]
      .sort((left, right) => left.sequence - right.sequence)
      .map((line) => [
        line.sequence,
        line.expenseDate.toISOString().slice(0, 10),
        line.category,
        line.description,
        line.payeeName ?? "—",
        line.paymentCents / 100,
        line.invoiceCents / 100,
        (line.invoiceCents - line.paymentCents) / 100
      ]),
    [],
    [
      "合计",
      "",
      "",
      "",
      "",
      input.totalPaymentCents / 100,
      input.totalInvoiceCents / 100,
      input.invoiceExcessCents / 100
    ],
    ["口径说明", "发票金额必须严格大于付款金额；金额统一以人民币元展示、数据库以分存储。"]
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet["!cols"] = [
    { wch: 8 },
    { wch: 14 },
    { wch: 16 },
    { wch: 42 },
    { wch: 18 },
    { wch: 16 },
    { wch: 16 },
    { wch: 14 }
  ];
  worksheet["!merges"] = [
    XLSX.utils.decode_range("A1:H1"),
    XLSX.utils.decode_range(`B${rows.length}:H${rows.length}`)
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "报销单");
  workbook.Props = {
    Title: `${input.code}-${input.title}`,
    Subject: "祥能HRMS报销闭环生成物",
    Author: "祥能人力资源综合信息系统",
    Company: "祥能"
  };
  return Buffer.from(
    XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
      compression: true
    })
  );
}

export type StoredZipEntry = {
  name: string;
  content: Buffer;
};

function crc32(input: Buffer): number {
  let value = 0xffffffff;
  for (const byte of input) {
    value ^= byte;
    for (let index = 0; index < 8; index += 1) {
      value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
    }
  }
  return (value ^ 0xffffffff) >>> 0;
}

function safeArchiveName(name: string): string {
  const normalized = name.replaceAll("\\", "/").replace(/^\/+/, "");
  if (
    !normalized ||
    normalized.includes("../") ||
    normalized.includes("\0")
  ) {
    throw new AppError(400, "INVALID_ARCHIVE_ENTRY", "材料包文件名无效");
  }
  return normalized;
}

function dosTimestamp(): { date: number; time: number } {
  // 固定时间使相同数据生成的材料包可复现，文件业务时间记录在数据库。
  return {
    date: ((2026 - 1980) << 9) | (1 << 5) | 1,
    time: 0
  };
}

export function createStoredZip(entries: readonly StoredZipEntry[]): Buffer {
  if (!entries.length) {
    throw new AppError(400, "EMPTY_ARTIFACT_PACKAGE", "材料包至少需要一个条目");
  }
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;
  const { date, time } = dosTimestamp();

  entries.forEach((entry) => {
    const name = Buffer.from(safeArchiveName(entry.name), "utf8");
    const checksum = crc32(entry.content);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(time, 10);
    localHeader.writeUInt16LE(date, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(entry.content.length, 18);
    localHeader.writeUInt32LE(entry.content.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, name, entry.content);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(time, 12);
    centralHeader.writeUInt16LE(date, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(entry.content.length, 20);
    centralHeader.writeUInt32LE(entry.content.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralParts.push(centralHeader, name);
    localOffset += localHeader.length + name.length + entry.content.length;
  });

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
}
