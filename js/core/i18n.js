window.SEM = window.SEM || {};
SEM.I18n = (() => {
  // Scope: app shell + navigation only (nav groups, route labels, top bar, sidebar
  // footer). Per-module content (dashboard tables, form labels inside each of the ~30
  // js/modules/*.js pages, etc.) is not translated yet — this establishes the i18n
  // pattern (SEM.I18n.t) so individual modules can adopt it incrementally later without
  // another architecture change.
  const DICT = {
    mn: {
      'navGroup.AI FIRST': 'AI ЭХЭНД',
      'navGroup.CEO CONTROL': 'ГҮЙЦЭТГЭХ ЗАХИРЛЫН ХЯНАЛТ',
      'navGroup.REVENUE OPS': 'ОРЛОГЫН ҮЙЛ АЖИЛЛАГАА',
      'navGroup.FACTORIES': 'ҮЙЛДВЭРҮҮД',
      'navGroup.ADMIN DATA': 'УДИРДЛАГЫН МЭДЭЭЛЭЛ',

      'nav.chatOps': 'AI Чат',
      'nav.workflowFactory': 'Ажлын урсгалын үйлдвэр',
      'nav.autoTester': 'Автомат чанарын шалгалт',
      'nav.mindmap': 'Үйл ажиллагааны зураглал',
      'nav.dashboard': 'Гүйцэтгэх хяналтын самбар',
      'nav.productionCore': 'Үйлдвэрлэлийн цөм',
      'nav.deploymentCenter': 'Байршуулалтын төв',
      'nav.approvals': 'Зөвшөөрлүүд',
      'nav.tasks': 'Даалгаврууд',
      'nav.myWork': 'Миний ажил',
      'nav.tokenControl': 'Токений хяналт',
      'nav.dealDesk': 'Хэлэлцээрийн ширээ',
      'nav.proposalFactory': 'Санал болголтын үйлдвэр',
      'nav.sales': 'Борлуулалтын систем',
      'nav.productInventory': 'Бүтээгдэхүүн + Агуулах',
      'nav.documents': 'Баримт бичиг + Мэдлэг',
      'nav.integrations': 'Slack + Drive',
      'nav.productFactory': 'Бүтээгдэхүүний үйлдвэр',
      'nav.softwareFactory': 'Программ хангамжийн үйлдвэр',
      'nav.moduleRegistry': 'Модулийн бүртгэл',
      'nav.architectureAudit': 'Архитектурын аудит',
      'nav.qaLab': 'Чанарын лаборатори',
      'nav.access': 'Хэрэглэгчийн эрх',
      'nav.companies': 'Компаниуд',
      'nav.people': 'Хүмүүс',
      'nav.kpiSalary': 'KPI + Цалин',
      'nav.projects': 'Төслүүд',
      'nav.memory': 'Санах ой',
      'nav.agents': 'AI Агентууд',
      'nav.aiBackend': 'Бодит AI сервер',
      'nav.automationExplorer': 'Автоматжуулалтын хайгуул',
      'nav.settings': 'Тохиргоо',
      'nav.command': 'Хуучин командын горим',

      'shell.eyebrow': 'Үүсгэн байгуулагчийн удирдлагын тархи',
      'shell.dashboardFallback': 'Хяналтын самбар',
      'shell.import': 'Импортлох',
      'shell.export': 'Экспортлох',
      'shell.newCommand': 'Шинэ команд',
      'shell.findModule': 'Модуль хайх…',
      'shell.devRuleLabel': 'Хөгжүүлэлтийн дүрэм',
      'shell.devRuleTitle': 'Зөвхөн засвар. Зөвхөн модуль. Токен хязгаартай.',
      'shell.devRuleBody': 'Бүх системийг биш, зөвхөн нэг модулийг өөрчил.',
      'shell.language': 'Хэл'
    }
  };

  function locale() {
    return (SEM.Store.get().settings.locale) || 'en';
  }

  function t(key, fallback) {
    const loc = locale();
    if (loc === 'en') return fallback !== undefined ? fallback : key;
    const val = DICT[loc] && DICT[loc][key];
    return val !== undefined ? val : (fallback !== undefined ? fallback : key);
  }

  function setLocale(loc) {
    const s = SEM.Store.get();
    s.settings.locale = loc === 'mn' ? 'mn' : 'en';
    SEM.Store.save();
  }

  function availableLocales() {
    return [{ code: 'en', label: 'English' }, { code: 'mn', label: 'Монгол' }];
  }

  return { t, locale, setLocale, availableLocales };
})();
