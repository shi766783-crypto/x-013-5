export const speciesOptions = ['狗', '猫', '兔', '鸟', '鱼', '其他']
export const activityTypes = ['散步', '奔跑', '玩耍']

export const normalRanges = {
  weight: { min: 3, max: 12, unit: 'kg', label: '体重' },
  temperature: { min: 37.5, max: 39.2, unit: '°C', label: '体温' },
  heartRate: { min: 60, max: 140, unit: 'bpm', label: '心率' },
}

export const achievementDefinitions = [
  { id: 'first-pet', icon: 'paw', title: '初次养宠', desc: '完成第一个宠物档案', condition: (s) => s.pets.length >= 1 },
  { id: 'health-keeper', icon: 'heart', title: '健康记录家', desc: '累计记录 5 次健康指标', condition: (s) => s.healthRecords.length >= 5 },
  { id: 'vaccine-on-time', icon: 'shield', title: '疫苗按时', desc: '添加一项完整疫苗计划', condition: (s) => s.vaccines.some((item) => item.nextDate) },
  { id: 'walk-master', icon: 'footprints', title: '遛狗达人', desc: '本周活动达到 180 分钟', condition: (s) => s.activities.filter((item) => isThisWeek(item.date)).reduce((sum, item) => sum + Number(item.duration || 0), 0) >= 180 },
  { id: 'pet-star', icon: 'star', title: '宠物之星', desc: '拥有 2 个及以上宠物', condition: (s) => s.pets.length >= 2 },
  { id: 'food-planner', icon: 'utensils', title: '营养规划师', desc: '为宠物设置喂食计划', condition: (s) => s.feedings.length >= 1 },
  { id: 'medication-pro', icon: 'pill', title: '用药管家', desc: '完成一项用药记录', condition: (s) => s.medications.length >= 1 },
  { id: 'trend-watcher', icon: 'chart', title: '趋势观察员', desc: '记录连续 3 天的体重', condition: (s) => new Set(s.healthRecords.filter((item) => item.type === 'weight').map((item) => item.date)).size >= 3 },
  { id: 'active-family', icon: 'sun', title: '活力家庭', desc: '累计完成 10 次活动', condition: (s) => s.activities.length >= 10 },
  { id: 'care-routine', icon: 'calendar', title: '规律生活', desc: '同时拥有喂食和用药计划', condition: (s) => s.feedings.length >= 1 && s.medications.length >= 1 },
  { id: 'wellness', icon: 'sparkles', title: '元气满满', desc: '完成 3 类健康记录', condition: (s) => new Set(s.healthRecords.map((item) => item.type)).size >= 3 },
  { id: 'family-record', icon: 'book', title: '家庭档案', desc: '填写宠物芯片或备注信息', condition: (s) => s.pets.some((item) => item.microchip || item.notes) },
]

export function uid(prefix = 'item') {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function todayISO() {
  const date = new Date()
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10)
}

export function daysFromToday(dateString) {
  const start = new Date(`${todayISO()}T00:00:00`)
  const target = new Date(`${dateString}T00:00:00`)
  return Math.round((target - start) / 86400000)
}

// 两个 ISO 日期相差的天数（endISO - startISO），按本地零点计算，避免时区误差
export function dateSpan(startISO, endISO) {
  const start = new Date(`${startISO}T00:00:00`)
  const end = new Date(`${endISO}T00:00:00`)
  return Math.round((end - start) / 86400000)
}

// 距离结束日多少天开始提醒停药/复诊
export const MEDICATION_REMIND_DAYS = 3

// 用药疗程状态的唯一判定入口：所有“今天是否还要喂、还剩几天、要不要提醒”
// 都从这里取，避免页面各自比较日期导致已结束疗程被误判成进行中
export function medicationCourse(medication, today = todayISO()) {
  const startDate = medication?.startDate || ''
  const endDate = medication?.endDate || ''

  // 异常数据（没有开始日期）：保守地视为未开始，不进入当日用药
  if (!startDate) {
    return { status: 'upcoming', valid: false, openEnded: false, totalDays: 0, completedDays: 0, remainingDays: null, progress: 0, endingSoon: false, lastDose: false, daysToStart: null, daysAfterEnd: null }
  }

  // 历史数据可能没有结束日期：视为长期用药，只按开始日期判断，不产生结束提醒
  if (!endDate) {
    const status = today < startDate ? 'upcoming' : 'active'
    return { status, valid: true, openEnded: true, totalDays: null, completedDays: status === 'active' ? dateSpan(startDate, today) + 1 : 0, remainingDays: null, progress: null, endingSoon: false, lastDose: false, daysToStart: status === 'upcoming' ? dateSpan(today, startDate) : 0, daysAfterEnd: 0 }
  }

  // 结束早于开始属于非法区间：开始日已过就按已结束处理，绝不计入当日用药
  if (endDate < startDate) {
    const status = today < startDate ? 'upcoming' : 'completed'
    return { status, valid: false, openEnded: false, totalDays: 0, completedDays: 0, remainingDays: 0, progress: 0, endingSoon: false, lastDose: false, daysToStart: status === 'upcoming' ? dateSpan(today, startDate) : 0, daysAfterEnd: today > endDate ? dateSpan(endDate, today) : 0 }
  }

  const totalDays = dateSpan(startDate, endDate) + 1
  const status = today < startDate ? 'upcoming' : today > endDate ? 'completed' : 'active'
  const completedDays = status === 'upcoming' ? 0 : status === 'completed' ? totalDays : dateSpan(startDate, today) + 1
  const remainingDays = status === 'active' ? dateSpan(today, endDate) + 1 : status === 'upcoming' ? totalDays : 0
  const progress = Math.round((completedDays / totalDays) * 100)
  const endingSoon = status === 'active' && remainingDays <= MEDICATION_REMIND_DAYS

  return {
    status,
    valid: true,
    openEnded: false,
    totalDays,
    completedDays,
    remainingDays,
    progress,
    endingSoon,
    lastDose: endingSoon && remainingDays === 1,
    daysToStart: status === 'upcoming' ? dateSpan(today, startDate) : 0,
    daysAfterEnd: status === 'completed' ? dateSpan(endDate, today) : 0,
  }
}

export function isThisWeek(dateString) {
  const date = new Date(`${dateString}T00:00:00`)
  const today = new Date(`${todayISO()}T00:00:00`)
  const day = today.getDay() || 7
  const monday = new Date(today)
  monday.setDate(today.getDate() - day + 1)
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return date >= monday && date <= sunday
}

export function calculateAge(birthDate) {
  if (!birthDate) return '年龄未知'
  const birth = new Date(`${birthDate}T00:00:00`)
  const now = new Date()
  let years = now.getFullYear() - birth.getFullYear()
  let months = now.getMonth() - birth.getMonth()
  if (now.getDate() < birth.getDate()) months -= 1
  if (months < 0) {
    years -= 1
    months += 12
  }
  if (years > 0) return `${years}岁${months ? ` ${months}个月` : ''}`
  return `${Math.max(months, 0)}个月`
}

export function formatDate(dateString, withYear = false) {
  if (!dateString) return '--'
  const date = new Date(`${dateString}T00:00:00`)
  return date.toLocaleDateString('zh-CN', withYear ? { year: 'numeric', month: 'long', day: 'numeric' } : { month: 'long', day: 'numeric' })
}

export function createDemoState() {
  const dayOffset = (offset) => {
    const date = new Date(`${todayISO()}T00:00:00`)
    date.setDate(date.getDate() + offset)
    return date.toISOString().slice(0, 10)
  }
  return {
    pets: [
      { id: 'pet-momo', name: 'Momo', species: '猫', breed: '英国短毛猫', gender: '母', birthDate: '2021-05-18', weight: 4.8, color: '奶油灰', neutered: true, microchip: '9820004112', photo: '', notes: '对海鲜敏感' },
      { id: 'pet-nori', name: 'Nori', species: '狗', breed: '柴犬', gender: '公', birthDate: '2020-10-03', weight: 9.2, color: '赤色', neutered: true, microchip: '', photo: '', notes: '' },
    ],
    healthRecords: [
      { id: 'health-1', petId: 'pet-momo', type: 'weight', date: dayOffset(-30), value: 4.6 },
      { id: 'health-2', petId: 'pet-momo', type: 'weight', date: dayOffset(-6), value: 4.8 },
      { id: 'health-3', petId: 'pet-momo', type: 'temperature', date: dayOffset(-4), value: 38.2 },
      { id: 'health-4', petId: 'pet-nori', type: 'weight', date: dayOffset(-10), value: 9.1 },
      { id: 'health-5', petId: 'pet-nori', type: 'weight', date: dayOffset(-2), value: 9.2 },
    ],
    vaccines: [
      { id: 'vaccine-1', petId: 'pet-momo', name: '猫三联', date: '2026-01-12', nextDate: dayOffset(5), hospital: '和煦动物医院', notes: '年度加强针' },
      { id: 'vaccine-2', petId: 'pet-nori', name: '狂犬疫苗', date: '2025-10-08', nextDate: dayOffset(14), hospital: '森屿宠物诊所', notes: '' },
    ],
    medications: [
      // 进行中：进度过半
      { id: 'med-1', petId: 'pet-momo', name: '益生菌', dose: '1包', frequency: '每日 1 次', startDate: dayOffset(-4), endDate: dayOffset(5), notes: '随餐喂食' },
      // 进行中且临近结束：触发停药/复诊提醒
      { id: 'med-2', petId: 'pet-nori', name: '阿莫西林克拉维酸钾', dose: '半片', frequency: '每日 2 次', startDate: dayOffset(-5), endDate: dayOffset(2), notes: '疗程结束后复诊复查' },
      // 已结束：不应再出现在当日用药里
      { id: 'med-3', petId: 'pet-momo', name: '驱虫药', dose: '1片', frequency: '每周 1 次', startDate: dayOffset(-14), endDate: dayOffset(-7), notes: '' },
      // 未开始：调整起始日后提醒应跟随变化
      { id: 'med-4', petId: 'pet-nori', name: '关节营养片', dose: '1片', frequency: '每日 1 次', startDate: dayOffset(4), endDate: dayOffset(18), notes: '复查后开始服用' },
    ],
    feedings: [
      { id: 'feed-1', petId: 'pet-momo', food: '主粮', brand: '渴望六种鱼', times: 2, portion: '35g' },
      { id: 'feed-2', petId: 'pet-nori', food: '主粮', brand: '爱肯拿鸭肉梨', times: 2, portion: '80g' },
    ],
    activities: [
      { id: 'activity-1', petId: 'pet-nori', date: dayOffset(-1), duration: 35, type: '散步', location: '江滨公园', notes: '' },
      { id: 'activity-2', petId: 'pet-nori', date: dayOffset(-3), duration: 50, type: '奔跑', location: '社区草坪', notes: '' },
      { id: 'activity-3', petId: 'pet-momo', date: dayOffset(-2), duration: 20, type: '玩耍', location: '家中', notes: '' },
    ],
  }
}
