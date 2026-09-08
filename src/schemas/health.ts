import { z } from "zod";

export const RECORD_TYPES = [
  "门诊病历",
  "检查报告",
  "处方用药",
  "体检记录",
  "住院记录",
  "其他",
] as const;
export const optionalDate = z.union([z.literal(""), z.iso.date()]);
export const memberSchema = z
  .object({
    name: z.string().trim().min(1, "请填写成员姓名或称呼").max(40),
    relationship: z.string().trim().max(30).default(""),
    birthDate: optionalDate.default(""),
    allergies: z.string().trim().max(1000).default(""),
    conditions: z.string().trim().max(1000).default(""),
    notes: z.string().trim().max(2000).default(""),
  })
  .strict()
  .refine(
    (value) =>
      !value.birthDate ||
      value.birthDate <=
        new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" }),
    { message: "出生日期不能晚于今天", path: ["birthDate"] },
  );
export type MemberInput = z.infer<typeof memberSchema>;
export type FamilyMember = MemberInput & {
  id: string;
  createdAt: string;
  updatedAt: string;
  recordCount: number;
};

export const healthFieldsSchema = z
  .object({
    recordType: z.enum(RECORD_TYPES),
    occurredOn: optionalDate,
    hospital: z.string().max(100),
    diagnosis: z.string().max(2000),
    medications: z.string().max(2000),
    followUp: z.string().max(2000),
  })
  .strict();
export const healthRecordSchema = healthFieldsSchema
  .extend({ memberId: z.uuid("请选择所属家庭成员") })
  .strict();
export type HealthRecord = z.infer<typeof healthRecordSchema>;
export const emptyHealthRecord = (memberId = ""): HealthRecord => ({
  memberId,
  recordType: "门诊病历",
  occurredOn: "",
  hospital: "",
  diagnosis: "",
  medications: "",
  followUp: "",
});

export const healthOrganizationSchema = healthFieldsSchema
  .extend({
    title: z.string().min(1).max(100),
    summary: z.string().min(1).max(500),
    tags: z.array(z.string().min(1).max(20)).max(8),
    uncertainties: z.array(z.string().max(300)).max(10),
  })
  .strict();
export type HealthOrganization = z.infer<typeof healthOrganizationSchema>;
