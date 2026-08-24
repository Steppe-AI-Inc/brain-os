export type Locale = "en" | "mn";

// Ported from the old app's js/core/i18n.js. Scope: app shell + navigation only, same as
// the original — per-module content adopts this pattern incrementally, not all at once.
export const DICT: Record<Exclude<Locale, "en">, Record<string, string>> = {
  mn: {
    "navGroup.AI FIRST": "AI ЭХЭНД",
    "navGroup.CEO CONTROL": "ГҮЙЦЭТГЭХ ЗАХИРЛЫН ХЯНАЛТ",
    "navGroup.REVENUE OPS": "ОРЛОГЫН ҮЙЛ АЖИЛЛАГАА",
    "navGroup.FACTORIES": "ҮЙЛДВЭРҮҮД",
    "navGroup.ADMIN DATA": "УДИРДЛАГЫН МЭДЭЭЛЭЛ",

    "nav.chatOps": "Brain OS-той ярих",
    "nav.models": "Моделийн шинжилгээ",
    "nav.help": "Тусламж & Асуулт",
    "nav.dashboard": "Гүйцэтгэх хяналтын самбар",
    "nav.companies": "Компаниуд",
    "nav.people": "Хүмүүс",
    "nav.projects": "Төслүүд",
    "nav.tasks": "Даалгаврууд",
    "nav.approvals": "Зөвшөөрлүүд",
    "nav.mindmap": "Үйл ажиллагааны зураглал",
    "nav.settings": "Тохиргоо",
    "nav.sales": "Борлуулалтын систем",
    "nav.proposals": "Санал болголтын үйлдвэр",
    "nav.inventory": "Бүтээгдэхүүн + Агуулах",
    "nav.documents": "Баримт бичиг + Мэдлэг",
    "nav.products": "Бүтээгдэхүүний үйлдвэр",
    "nav.kpi": "KPI + Цалин",
    "nav.memory": "Санах ой",
    "nav.workflows": "Ажлын урсгалын үйлдвэр",
    "nav.software": "Программ хангамжийн үйлдвэр",
    "nav.integrations": "Slack + Drive",
    "nav.access": "Хэрэглэгчийн эрх",

    "shell.eyebrow": "Үүсгэн байгуулагчийн удирдлагын тархи",
    "shell.dashboardFallback": "Хяналтын самбар",
    "shell.findModule": "Модуль хайх…",
    "shell.language": "Хэл",
    "shell.signOut": "Гарах",
  },
};

export function t(locale: Locale, key: string, fallback: string): string {
  if (locale === "en") return fallback;
  const val = DICT[locale]?.[key];
  return val !== undefined ? val : fallback;
}
