import { computed, reactive, watch } from 'vue'
import { achievementDefinitions, createDemoState, daysFromToday, isThisWeek, MEDICATION_REMIND_DAYS, medicationCourse, normalRanges, uid } from '../data'

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
  const medicationCourses = computed(() => state.medications.map((item) => ({ ...item, course: medicationCourse(item) })))
  const activeMedications = computed(() => medicationCourses.value.filter((item) => item.course.status === 'active'))
  const upcomingMedications = computed(() => medicationCourses.value.filter((item) => item.course.status === 'upcoming'))
  const endedMedications = computed(() => medicationCourses.value.filter((item) => item.course.status === 'ended'))
  const medicationsToday = computed(() => activeMedications.value.length)
  const medicationReminders = computed(() => activeMedications.value
    .filter((item) => item.course.remainingDays !== null && item.course.remainingDays <= MEDICATION_REMIND_DAYS)
    .sort((a, b) => a.course.remainingDays - b.course.remainingDays))
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
  function update(itemType, id, payload) {
    const index = state[itemType].findIndex((item) => item.id === id)
    if (index !== -1) state[itemType][index] = { ...state[itemType][index], ...payload, id }
  }
  function addPet(payload) {
    add('pets', payload)
  }
  function resetDemo() {
    const fresh = createDemoState()
    Object.keys(state).forEach((key) => { state[key].splice(0, state[key].length, ...(fresh[key] || [])) })
  }

  return { state, petById, petName, totalActivity, pendingVaccines, feedingTasks, medicationCourses, activeMedications, upcomingMedications, endedMedications, medicationsToday, medicationReminders, achievements, healthCompleteness, weightCompliance, add, update, addPet, resetDemo }
}
