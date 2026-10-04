import { computed, reactive, watch } from 'vue'
import { achievementDefinitions, createDemoState, daysFromToday, isThisWeek, medicationCourse, normalRanges, todayISO, uid } from '../data'

const STORAGE_KEY = 'petcare-home-state'
const saved = localStorage.getItem(STORAGE_KEY)
const state = reactive(saved ? JSON.parse(saved) : createDemoState())

watch(state, (value) => localStorage.setItem(STORAGE_KEY, JSON.stringify(value)), { deep: true })

export function usePetStore() {
  const petById = (id) => state.pets.find((pet) => pet.id === id)
  const petName = (id) => petById(id)?.name || '未命名宠物'
  const totalActivity = computed(() => state.activities.filter((item) => isThisWeek(item.date)).reduce((sum, item) => sum + Number(item.duration || 0), 0))
  const pendingVaccines = computed(() => state.vaccines.filter((item) => daysFromToday(item.nextDate) <= 7).length)
  const feedingTasks = computed(() => state.feedings.reduce((sum, item) => sum + Number(item.times || 0), 0))

  // 疗程信息全部由 medicationCourse 统一计算，页面不再自行比较日期
  const medicationCourses = computed(() => state.medications
    .map((item) => ({ ...item, course: medicationCourse(item) }))
    // 进行中（临期优先）→ 未开始（开始日近的优先）→ 已结束（刚结束的在前）
    .sort((a, b) => {
      const rank = { active: 0, upcoming: 1, completed: 2 }
      if (rank[a.course.status] !== rank[b.course.status]) return rank[a.course.status] - rank[b.course.status]
      if (a.course.status === 'active') return a.course.remainingDays - b.course.remainingDays
      if (a.course.status === 'upcoming') return a.course.daysToStart - b.course.daysToStart
      return b.course.daysAfterEnd - a.course.daysAfterEnd
    }))
  // 今日仍在疗程内（含结束日当天）：已结束/未开始/非法区间都不会混入
  const activeMedications = computed(() => medicationCourses.value.filter((item) => item.course.status === 'active'))
  const medicationsToday = computed(() => activeMedications.value.length)
  // 临近结束、需要停药或复诊提醒的疗程（提醒随结束日期实时变化）
  const endingSoonMedications = computed(() => activeMedications.value.filter((item) => item.course.endingSoon))

  const achievements = computed(() => achievementDefinitions.map((item) => ({ ...item, unlocked: item.condition(state) })))
  const healthCompleteness = (petId) => {
    const fields = ['weight', 'temperature', 'heartRate']
    const count = fields.filter((type) => state.healthRecords.some((item) => item.petId === petId && item.type === type)).length
    return Math.round((count / fields.length) * 100)
  }
  const weightCompliance = (petId) => {
    const records = state.healthRecords.filter((item) => item.petId === petId && item.type === 'weight')
    if (!records.length) return 0
    return Math.round((records.filter((item) => item.value >= normalRanges.weight.min && item.value <= normalRanges.weight.max).length / records.length) * 100)
  }

  function add(itemType, payload) {
    state[itemType].unshift({ id: uid(itemType.slice(0, -1)), ...payload })
  }
  function addPet(payload) {
    add('pets', payload)
  }
  // 延长/提前结束疗程时只改日期，剩余天数、进度和提醒都会跟随重新计算
  function updateItem(itemType, id, patch) {
    const target = state[itemType].find((item) => item.id === id)
    if (target) Object.assign(target, patch)
  }
  // 提前结束：把结束日期设为今天，当天仍服药一次，之后自动从当日用药消失
  function finishMedication(id) {
    updateItem('medications', id, { endDate: todayISO() })
  }
  function resetDemo() {
    const fresh = createDemoState()
    Object.keys(state).forEach((key) => { state[key].splice(0, state[key].length, ...(fresh[key] || [])) })
  }

  return { state, petById, petName, totalActivity, pendingVaccines, feedingTasks, medicationCourses, activeMedications, medicationsToday, endingSoonMedications, achievements, healthCompleteness, weightCompliance, add, addPet, updateItem, finishMedication, resetDemo }
}
