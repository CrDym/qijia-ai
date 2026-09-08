import type { Category } from "@/schemas/document";
import type { IconName } from "./icon";

export const CATEGORY_META: Record<
  Category,
  { icon: IconName; tone: string; description: string }
> = {
  健康档案: {
    icon: "heart",
    tone: "rose",
    description: "病历、检查报告、处方和体检记录",
  },
  家庭事务: {
    icon: "home",
    tone: "sage",
    description: "维修记录、办事流程、家里的大小事",
  },
  物品资料: {
    icon: "box",
    tone: "sand",
    description: "说明书、耗材型号、保修信息",
  },
  实用知识: {
    icon: "book",
    tone: "blue",
    description: "值得留下的经验、教程和生活技巧",
  },
  重要安排: {
    icon: "calendar",
    tone: "rose",
    description: "出行准备、学校要求、家庭约定",
  },
};
