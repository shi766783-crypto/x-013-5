<script setup>
import { computed, ref } from 'vue'
import { Activity, Award, Bell, BellRing, BookOpen, CalendarDays, ChartNoAxesCombined, Check, ChevronRight, CircleHelp, Clock3, HeartPulse, LayoutDashboard, Menu, PawPrint, Pencil, Pill, Plus, RotateCcw, Settings, ShieldCheck, Sparkles, Utensils, X } from 'lucide-vue-next'
import PetModal from './components/PetModal.vue'
import RecordModal from './components/RecordModal.vue'
import TrendChart from './components/TrendChart.vue'
import { calculateAge, daysFromToday, formatDate, MEDICATION_REMIND_DAYS, normalRanges, todayISO } from './data'
import { usePetStore } from './composables/usePetStore'

const { state, petById, petName, totalActivity, pendingVaccines, feedingTasks, medicationCourses, medicationsToday, endingSoonMedications, achievements, healthCompleteness, weightCompliance, add, addPet, updateItem, finishMedication } = usePetStore()
const activeNav = ref('overview')
const showPetModal = ref(false)
const recordType = ref('')
const editingRecord = ref(null)
const selectedPetId = ref('pet-momo')
const selectedMetric = ref('weight')
const mobileMenu = ref(false)
const navItems = [
  { id: 'overview', label: '总览', icon: LayoutDashboard },
  { id: 'health', label: '健康档案', icon: HeartPulse },
  { id: 'schedule', label: '日程提醒', icon: CalendarDays },
  { id: 'activity', label: '活动记录', icon: Activity },
  { id: 'achievements', label: '成就徽章', icon: Award },
]
const currentPet = computed(() => petById(selectedPetId.value) || state.pets[0])

// 顶栏日期随当天动态显示，避免硬编码与实际日期错位
const todayText = computed(() => {
  const weekdays = ['日', '一', '二', '三', '四', '五', '六']
  const now = new Date(`${todayISO()}T00:00:00`)
  return {
    weekday: `星期${weekdays[now.getDay()]}`,
    long: `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`,
    short: `${now.getMonth() + 1}月${now.getDate()}日`,
  }
})
const recentHealthRecords = computed(() => state.healthRecords.filter((item) => item.petId === selectedPetId.value && item.type === selectedMetric.value).sort((a, b) => a.date.localeCompare(b.date)).slice(-7))
const healthStatus = computed(() => {
  const value = Number(recentHealthRecords.value.at(-1)?.value || currentPet.value?.weight || 0)
  const range = normalRanges[selectedMetric.value]
  if (!value) return { label: '等待记录', className: 'neutral' }
  return value >= range.min && value <= range.max
    ? { label: '处于正常范围', className: 'good' }
    : { label: '建议重点关注', className: 'attention' }
})
const activeAchievements = computed(() => achievements.value.filter((item) => item.unlocked))
const upcomingVaccines = computed(() => state.vaccines.map((item) => ({ ...item, days: daysFromToday(item.nextDate) })).sort((a, b) => a.days - b.days))
const agenda = computed(() => {
  const feedingItems = state.feedings.flatMap((item) => Array.from(
    { length: Number(item.times || 1) },
    (_, index) => ({
      id: `${item.id}-${index}`,
      kind: 'feeding',
      icon: Utensils,
      title: `${petName(item.petId)} · ${item.food}`,
      detail: `${item.portion || '按计划'} · 第 ${index + 1} 餐`,
      time: index === 0 ? '08:00' : index === 1 ? '18:00' : '21:00',
    }),
  ))
  // 当日用药只取状态为 active 的疗程，已结束/未开始的不会出现；附带剩余天数与临期提醒
  const medicationItems = medicationCourses.value
    .filter((item) => item.course.status === 'active')
    .map((item) => ({
      id: item.id,
      kind: 'medication',
      icon: Pill,
      title: `${petName(item.petId)} · ${item.name}`,
      detail: item.course.openEnded ? `${item.dose} · ${item.frequency} · 长期用药` : `${item.dose} · ${item.frequency} · ${medicationRemainingLabel(item)}`,
      alert: item.course.endingSoon ? medicationAlertText(item) : '',
      time: '09:00',
    }))
  const vaccineItems = upcomingVaccines.value
    .filter((item) => item.days <= 7)
    .map((item) => ({
      id: item.id,
      kind: 'vaccine',
      icon: ShieldCheck,
      title: `${petName(item.petId)} · ${item.name}`,
      detail: item.days < 0 ? '已逾期，请尽快安排' : item.days === 0 ? '今天需要接种' : `${item.days} 天后到期`,
      time: '提醒',
    }))
  return [...medicationItems, ...vaccineItems, ...feedingItems]
})
const averageWeightChange = computed(() => {
  const records = state.healthRecords.filter((item) => item.type === 'weight')
  if (records.length < 2) return '0.0 kg'
  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date))
  return `${(Number(sorted[sorted.length - 1].value) - Number(sorted[0].value)).toFixed(1)} kg`
})
const leaderboard = computed(() => state.pets.map((pet) => ({ ...pet, completeness: healthCompleteness(pet.id), activity: state.activities.filter((item) => item.petId === pet.id).reduce((sum, item) => sum + Number(item.duration || 0), 0) })).sort((a, b) => b.completeness - a.completeness))

function openRecord(type) { recordType.value = type; editingRecord.value = null }
function editMedication(item) { recordType.value = 'medication'; editingRecord.value = item }
function stopMedication(item) { finishMedication(item.id) }
function saveRecord({ collection, payload, edit }) {
  if (collection === 'medications') {
    const { course, ...data } = payload
    if (edit) updateItem(collection, data.id, data)
    else add(collection, data)
  } else if (edit) {
    updateItem(collection, payload.id, payload)
  } else {
    add(collection, payload)
  }
  recordType.value = ''
  editingRecord.value = null
}
function metricLabel(type) { return normalRanges[type]?.label || type }
function vaccineTone(days) { return days < 0 ? 'danger' : days <= 7 ? 'warning' : 'success' }

// 疗程展示文案：剩余天数、进度、状态标签、停药/复诊提醒
function medicationRemainingLabel(item) {
  const { remainingDays, totalDays } = item.course
  return remainingDays === 1 ? `疗程最后一天 · 共 ${totalDays} 天` : `还剩 ${remainingDays} 天 · 共 ${totalDays} 天`
}
function medicationAlertText(item) {
  if (item.course.lastDose) return '今天最后一剂，明日起停药并安排复诊'
  return `疗程还剩 ${item.course.remainingDays} 天，准备停药/复诊`
}
function medicationStatusLabel(item) {
  const { status, remainingDays, daysToStart } = item.course
  if (status === 'active') return remainingDays === 1 ? '今天结束' : '进行中'
  if (status === 'upcoming') return daysToStart === 0 ? '明天开始' : `${daysToStart} 天后开始`
  return item.course.daysAfterEnd === 1 ? '昨天已结束' : `已结束 ${item.course.daysAfterEnd} 天`
}
function medicationProgressLabel(item) {
  const course = item.course
  if (course.openEnded) return '长期用药 · 未设结束日期'
  if (course.status === 'upcoming') return `共 ${course.totalDays} 天 · 第 ${course.daysToStart} 天后开始`
  if (course.status === 'completed') return `已完成全部 ${course.totalDays} 天疗程`
  return `第 ${course.completedDays}/${course.totalDays} 天`
}
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar" :class="{ 'is-open': mobileMenu }">
      <div class="brand"><div class="brand-mark"><PawPrint :size="20" /></div><div><strong>宠物家</strong><span>Petcare Home</span></div><button class="icon-btn mobile-close" @click="mobileMenu = false"><X :size="18" /></button></div>
      <div class="household"><div class="household-avatar">林</div><div><strong>林家宠物屋</strong><span>2 位家庭成员</span></div><ChevronRight :size="16" /></div>
      <nav class="nav-list"><button v-for="item in navItems" :key="item.id" :class="{ active: activeNav === item.id }" @click="activeNav = item.id; mobileMenu = false"><component :is="item.icon" :size="18" /><span>{{ item.label }}</span><span v-if="item.id === 'schedule' && agenda.length" class="nav-count">{{ agenda.length }}</span></button></nav>
      <div class="sidebar-bottom"><button><BookOpen :size="18" />知识库</button><button><Settings :size="18" />设置</button><div class="help-box"><CircleHelp :size="17" /><span>需要帮助？<b>查看使用指南</b></span></div></div>
    </aside>
    <main class="main-content">
      <header class="topbar"><button class="icon-btn menu-toggle" @click="mobileMenu = true"><Menu :size="21" /></button><div><span class="eyebrow">{{ activeNav === 'overview' ? '家庭健康空间' : navItems.find((item) => item.id === activeNav)?.label }}</span><h1>{{ activeNav === 'overview' ? '早上好，林家。' : navItems.find((item) => item.id === activeNav)?.label }}</h1></div><div class="top-actions"><button class="icon-btn notification" :title="endingSoonMedications.length ? `${endingSoonMedications.length} 个用药疗程即将结束` : '暂无临期提醒'"><Bell :size="19" /><i v-if="endingSoonMedications.length"></i></button><button class="user-chip"><span>林</span><strong>Lin</strong></button></div></header>
      <div v-if="activeNav === 'overview'" class="page">
        <section class="welcome-row"><div><p class="section-kicker">{{ todayText.weekday }}，{{ todayText.long }}</p><h2>今天也要好好照顾它们。</h2><p class="muted">这里是你和 Momo、Nori 的小小健康空间。</p></div><button class="btn btn-primary" @click="showPetModal = true"><Plus :size="17" />添加宠物</button></section>
        <section class="stat-grid"><article class="stat-card"><div class="stat-icon green"><PawPrint :size="19" /></div><div><span>我的宠物</span><strong>{{ state.pets.length }}<small> 位</small></strong><em>档案都很完整</em></div></article><article class="stat-card"><div class="stat-icon peach"><Utensils :size="19" /></div><div><span>今日待喂食</span><strong>{{ feedingTasks }}<small> 餐</small></strong><em>按计划进行中</em></div></article><article class="stat-card"><div class="stat-icon lavender"><ShieldCheck :size="19" /></div><div><span>待接种疫苗</span><strong>{{ pendingVaccines }}<small> 项</small></strong><em :class="{ 'text-warning': pendingVaccines }">{{ pendingVaccines ? '有一项即将到期' : '暂无临期提醒' }}</em></div></article><article class="stat-card"><div class="stat-icon blue"><Activity :size="19" /></div><div><span>本周活动</span><strong>{{ totalActivity }}<small> 分钟</small></strong><em>平均体重变化 {{ averageWeightChange }}</em></div></article></section>
        <section class="content-grid">
          <article class="panel pets-panel"><div class="panel-heading"><div><span class="eyebrow">成员档案</span><h3>我的宠物</h3></div><button class="text-btn" @click="activeNav = 'health'">查看档案 <ChevronRight :size="15" /></button></div><div class="pet-list"><button v-for="pet in state.pets" :key="pet.id" class="pet-card" :class="{ selected: selectedPetId === pet.id }" @click="selectedPetId = pet.id"><div class="pet-avatar" :class="pet.species === '狗' ? 'dog' : 'cat'"><img v-if="pet.photo" :src="pet.photo" :alt="pet.name" /><span v-else>{{ pet.species === '狗' ? '🐕' : pet.species === '猫' ? '🐈' : '🐾' }}</span></div><div class="pet-info"><strong>{{ pet.name }}</strong><span>{{ pet.breed || pet.species }} · {{ pet.gender }}</span><span>{{ calculateAge(pet.birthDate) }} · {{ pet.weight || '--' }} kg</span></div><div class="pet-status"><span class="status-dot"></span>健康</div><ChevronRight class="pet-arrow" :size="17" /></button><button class="add-pet-card" @click="showPetModal = true"><span><Plus :size="18" /></span><strong>添加新宠物</strong><small>建立专属健康档案</small></button></div></article>
          <article class="panel agenda-panel"><div class="panel-heading"><div><span class="eyebrow">今天 · {{ todayText.short }}</span><h3>日程提醒</h3></div><button class="icon-btn subtle"><CalendarDays :size="18" /></button></div><div class="agenda-list"><div v-for="item in agenda.slice(0, 5)" :key="item.id" class="agenda-item"><div class="agenda-time">{{ item.time }}</div><div class="agenda-icon" :class="item.kind"><component :is="item.icon" :size="17" /></div><div class="agenda-copy"><strong>{{ item.title }}</strong><span>{{ item.detail }}</span><span v-if="item.alert" class="agenda-alert"><BellRing :size="10" />{{ item.alert }}</span></div><button class="check-circle"><Check :size="14" /></button></div><div v-if="!agenda.length" class="empty-state">今天没有待办，享受轻松的一天吧。</div></div><button class="full-btn" @click="activeNav = 'schedule'">查看全部日程 <ChevronRight :size="15" /></button></article>
        </section>
        <section class="content-grid lower-grid">
          <article class="panel trend-panel"><div class="panel-heading"><div><span class="eyebrow">健康趋势</span><h3>{{ currentPet?.name }} 的{{ metricLabel(selectedMetric) }}变化</h3></div><div class="segmented"><button v-for="metric in ['weight', 'temperature', 'heartRate']" :key="metric" :class="{ active: selectedMetric === metric }" @click="selectedMetric = metric">{{ metricLabel(metric) }}</button></div></div><div class="trend-summary"><div><strong>{{ recentHealthRecords.at(-1)?.value || currentPet?.weight || '--' }} <small>{{ normalRanges[selectedMetric].unit }}</small></strong><span>最近记录 · {{ recentHealthRecords.at(-1)?.date ? formatDate(recentHealthRecords.at(-1).date) : '暂无' }}</span></div><span class="health-status" :class="healthStatus.className"><i></i>{{ healthStatus.label }}</span><span class="range-tag"><span></span>正常范围 {{ normalRanges[selectedMetric].min }} - {{ normalRanges[selectedMetric].max }} {{ normalRanges[selectedMetric].unit }}</span></div><TrendChart :records="recentHealthRecords" :type="selectedMetric" /><button class="full-btn" @click="openRecord('health')">记录健康指标 <Plus :size="15" /></button></article>
          <article class="panel quick-panel"><div class="panel-heading"><div><span class="eyebrow">快速记录</span><h3>把日常变成习惯</h3></div><Sparkles :size="18" class="heading-spark" /></div><div class="quick-actions"><button @click="openRecord('health')"><span class="quick-icon health"><HeartPulse :size="19" /></span><span><strong>健康指标</strong><small>体重、体温、心率</small></span><ChevronRight :size="16" /></button><button @click="openRecord('vaccine')"><span class="quick-icon vaccine"><ShieldCheck :size="19" /></span><span><strong>疫苗与驱虫</strong><small>守护免疫计划</small></span><ChevronRight :size="16" /></button><button @click="openRecord('activity')"><span class="quick-icon activity"><Activity :size="19" /></span><span><strong>活动记录</strong><small>记录每一次活力</small></span><ChevronRight :size="16" /></button><button @click="openRecord('feeding')"><span class="quick-icon feeding"><Utensils :size="19" /></span><span><strong>喂食计划</strong><small>安排每日饮食</small></span><ChevronRight :size="16" /></button></div></article>
        </section>
        <section class="content-grid bottom-grid"><article class="panel vaccine-panel"><div class="panel-heading"><div><span class="eyebrow">免疫计划</span><h3>疫苗与驱虫</h3></div><button class="text-btn" @click="openRecord('vaccine')">添加 <Plus :size="15" /></button></div><div class="vaccine-list"><div v-for="item in upcomingVaccines.slice(0, 3)" :key="item.id" class="vaccine-item"><div class="vaccine-mark"><ShieldCheck :size="17" /></div><div><strong>{{ item.category || '疫苗' }} · {{ item.name }}</strong><span>{{ petName(item.petId) }} · {{ item.hospital || '未填写医院' }}</span></div><span class="date-badge" :class="vaccineTone(item.days)">{{ item.days < 0 ? '已逾期' : item.days === 0 ? '今天' : `${item.days} 天后` }}</span></div></div></article><article class="panel achievement-panel"><div class="panel-heading"><div><span class="eyebrow">成长足迹</span><h3>成就徽章 <small>{{ activeAchievements.length }}/12</small></h3></div><button class="text-btn" @click="activeNav = 'achievements'">全部 <ChevronRight :size="15" /></button></div><div class="badge-row"><div v-for="item in achievements.slice(0, 6)" :key="item.id" class="badge-item" :class="{ locked: !item.unlocked }"><div><Award v-if="item.unlocked" :size="21" /><span v-else>?</span></div><small>{{ item.title }}</small></div></div></article></section>
      </div>
      <div v-else class="page placeholder-page">
        <section class="welcome-row"><div><p class="section-kicker">家庭健康空间</p><h2>{{ navItems.find((item) => item.id === activeNav)?.label }}</h2><p class="muted">所有记录都会自动保存在当前设备。</p></div><button class="btn btn-primary" @click="openRecord(activeNav === 'health' ? 'health' : activeNav === 'schedule' ? 'medication' : activeNav === 'activity' ? 'activity' : 'vaccine')"><Plus :size="17" />{{ activeNav === 'schedule' ? '添加用药计划' : '添加记录' }}</button></section>
        <section class="content-grid"><article class="panel wide-panel"><div class="panel-heading"><div><span class="eyebrow">数据概览</span><h3>{{ activeNav === 'achievements' ? '我的成就' : activeNav === 'schedule' ? '全部日程' : activeNav === 'activity' ? '活动历史' : '健康档案' }}</h3></div></div><div v-if="activeNav === 'achievements'" class="all-badges"><div v-for="item in achievements" :key="item.id" class="achievement-row" :class="{ unlocked: item.unlocked }"><div class="badge-large"><Award v-if="item.unlocked" :size="22" /><span v-else>?</span></div><div><strong>{{ item.title }}</strong><span>{{ item.desc }}</span></div><b>{{ item.unlocked ? '已解锁' : '未解锁' }}</b></div></div><div v-else-if="activeNav === 'schedule'" class="agenda-list large-list"><div v-for="item in agenda" :key="item.id" class="agenda-item"><div class="agenda-time">{{ item.time }}</div><div class="agenda-icon" :class="item.kind"><component :is="item.icon" :size="17" /></div><div class="agenda-copy"><strong>{{ item.title }}</strong><span>{{ item.detail }}</span><span v-if="item.alert" class="agenda-alert"><BellRing :size="10" />{{ item.alert }}</span></div><button class="check-circle"><Check :size="14" /></button></div></div><div v-else-if="activeNav === 'activity'" class="table-list"><div v-for="item in state.activities" :key="item.id" class="table-row"><strong>{{ petName(item.petId) }}</strong><span>{{ formatDate(item.date, true) }}</span><span>{{ item.type }} · {{ item.duration }} 分钟</span><span>{{ item.location || '未填写地点' }}</span></div></div><div v-else class="table-list"><div v-for="item in state.healthRecords" :key="item.id" class="table-row"><strong>{{ petName(item.petId) }}</strong><span>{{ formatDate(item.date, true) }}</span><span>{{ metricLabel(item.type) }}</span><span>{{ item.value }} {{ normalRanges[item.type].unit }}</span></div></div></article><article class="panel leaderboard-panel"><div class="panel-heading"><div><span class="eyebrow">家庭榜单</span><h3>健康榜</h3></div><ChartNoAxesCombined :size="19" /></div><div v-for="(pet, index) in leaderboard" :key="pet.id" class="rank-row"><span class="rank-number">{{ String(index + 1).padStart(2, '0') }}</span><div class="mini-avatar">{{ pet.species === '狗' ? '🐕' : '🐈' }}</div><div><strong>{{ pet.name }}</strong><span>档案完整度 {{ pet.completeness }}%</span></div><b>{{ pet.completeness }}</b></div></article></section>
        <section v-if="activeNav === 'schedule'" class="medication-section">
          <div class="panel">
            <div class="panel-heading">
              <div><span class="eyebrow">用药管理</span><h3>用药疗程 <small>今日进行 {{ medicationsToday }} 项 · {{ endingSoonMedications.length }} 项临近结束</small></h3></div>
              <button class="text-btn" @click="openRecord('medication')">添加用药计划 <Plus :size="15" /></button>
            </div>
            <div v-if="endingSoonMedications.length" class="medication-reminder-banner">
              <BellRing :size="15" />
              <span><strong>{{ endingSoonMedications.length }} 个疗程即将结束</strong>：最后 {{ MEDICATION_REMIND_DAYS }} 天会在此提醒，请按医嘱准备停药或安排复诊；结束后将自动移出当日用药。</span>
            </div>
            <div class="medication-grid">
              <article v-for="item in medicationCourses" :key="item.id" class="med-card" :class="[item.course.status, { alert: item.course.endingSoon }]">
                <div class="med-card-head">
                  <div class="med-mark"><Pill :size="16" /></div>
                  <div class="med-title"><strong>{{ item.name }}</strong><span>{{ petName(item.petId) }} · {{ item.dose || '剂量未填' }} · {{ item.frequency }}</span></div>
                  <span class="med-status" :class="item.course.status">{{ medicationStatusLabel(item) }}</span>
                </div>
                <div v-if="!item.course.openEnded" class="med-progress">
                  <div class="med-progress-track"><div class="med-progress-bar" :class="{ ending: item.course.endingSoon }" :style="{ width: `${item.course.progress}%` }"></div></div>
                  <div class="med-progress-meta">
                    <span>{{ medicationProgressLabel(item) }}</span>
                    <strong v-if="item.course.status === 'active'">{{ item.course.remainingDays === 1 ? '剩今天' : `剩 ${item.course.remainingDays} 天` }}</strong>
                    <strong v-else-if="item.course.status === 'upcoming'">剩 {{ item.course.remainingDays }} 天</strong>
                    <strong v-else>{{ item.course.progress }}%</strong>
                  </div>
                </div>
                <p v-else class="med-progress-meta open-ended"><Clock3 :size="12" />长期用药 · 未设结束日期，不产生结束提醒</p>
                <div class="med-date-row">
                  <span>{{ formatDate(item.startDate, true) }} <i>起</i></span>
                  <ChevronRight :size="12" />
                  <span v-if="item.endDate">{{ formatDate(item.endDate, true) }} <i>止</i></span>
                  <span v-else>长期 <i>止</i></span>
                </div>
                <p v-if="item.course.endingSoon" class="med-alert-line"><BellRing :size="12" />{{ medicationAlertText(item) }}</p>
                <p v-else-if="item.notes" class="med-notes">{{ item.notes }}</p>
                <div v-if="item.course.status !== 'completed'" class="med-actions">
                  <button class="med-action-btn" @click="editMedication(item)"><Pencil :size="12" />调整日期</button>
                  <button v-if="item.course.status === 'active'" class="med-action-btn stop" @click="stopMedication(item)"><RotateCcw :size="12" />提前结束</button>
                </div>
                <div v-else class="med-actions">
                  <button class="med-action-btn" @click="editMedication(item)"><Pencil :size="12" />延长疗程</button>
                </div>
              </article>
            </div>
            <div v-if="!medicationCourses.length" class="empty-state">还没有用药计划，点击右上角添加第一个疗程。</div>
          </div>
        </section>
      </div>
    </main>
    <PetModal :visible="showPetModal" @close="showPetModal = false" @submit="(payload) => { addPet(payload); showPetModal = false }" />
    <RecordModal :visible="!!recordType" :type="recordType || 'health'" :pets="state.pets" :editing="editingRecord" @close="recordType = ''; editingRecord = null" @submit="saveRecord" />
  </div>
</template>
