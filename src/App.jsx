import { useState, useEffect, useRef } from 'react'
import { 
  Bell, FileText, Plus, X, Calendar, 
  CheckSquare, Search, ChevronLeft, ChevronRight, 
  Trash2, Save, LogOut, User
} from 'lucide-react'
import { 
  format, startOfMonth, endOfMonth, startOfWeek, 
  endOfWeek, addDays, addMonths, subMonths, isSameMonth,
  isToday
} from 'date-fns'
import './index.css'

const COLORS = ['#e07b39', '#f4a460', '#38bdf8', '#8b5cf6', '#ec4899', '#4ade80', '#fbbf24', '#ef4444']
const API_URL = '/api'

function App() {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [authMode, setAuthMode] = useState('login')
  const [authError, setAuthError] = useState('')
  const [loading, setLoading] = useState(true)
  
  const [currentDate, setCurrentDate] = useState(new Date())
  const [currentView, setCurrentView] = useState('event')
  const [events, setEvents] = useState([])
  const [tasks, setTasks] = useState([])
  const [notes, setNotes] = useState([])
  const [notifications, setNotifications] = useState([])
  const [panelOpen, setPanelOpen] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [selectedDate, setSelectedDate] = useState(null)
  const [noteLinkType, setNoteLinkType] = useState('')
  const [modalType, setModalType] = useState(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [modalKey, setModalKey] = useState(0)
  const initialized = useRef(false)

  useEffect(() => {
    const savedToken = localStorage.getItem('calendarToken')
    const savedUser = localStorage.getItem('calendarUser')
    if (savedToken && savedUser) {
      setToken(savedToken)
      setUser(JSON.parse(savedUser))
    } else {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (user && token && !initialized.current) {
      initialized.current = true
      loadData()
    }
  }, [user, token])

  const apiCall = async (endpoint, options = {}) => {
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Request failed: ${response.status}`)
      }
      return response.json()
    } catch (err) {
      console.error('API Error:', err)
      throw err
    }
  }

  const handleAuth = async (e) => {
    e.preventDefault()
    setAuthError('')
    const form = e.target
    const email = form.email.value
    const password = form.password.value
    const name = form.name?.value

    try {
      const endpoint = authMode === 'login' ? '/login' : '/register'
      console.log('Attempting auth to:', `${API_URL}${endpoint}`)
      const data = await apiCall(endpoint, {
        method: 'POST',
        body: JSON.stringify(authMode === 'register' ? { email, password, name } : { email, password })
      })

      localStorage.setItem('calendarToken', data.token)
      localStorage.setItem('calendarUser', JSON.stringify({ id: data.userId, email: data.email, name: data.name }))
      setToken(data.token)
      setUser({ id: data.userId, email: data.email, name: data.name })
    } catch (err) {
      console.error('Auth error:', err)
      setAuthError(err.message || 'Failed to connect to server')
    }
  }

  const logout = () => {
    localStorage.removeItem('calendarToken')
    localStorage.removeItem('calendarUser')
    setUser(null)
    setToken(null)
    setEvents([])
    setTasks([])
    setNotes([])
    setNotifications([])
    initialized.current = false
  }

  const loadData = async () => {
    try {
      const [eventsData, tasksData, notesData, notificationsData] = await Promise.all([
        apiCall('/events'),
        apiCall('/tasks'),
        apiCall('/notes'),
        apiCall('/notifications')
      ])
      setEvents(eventsData)
      setTasks(tasksData)
      setNotes(notesData)
      setNotifications(notificationsData.map(n => ({ ...n, unread: !n.is_read })))
    } catch (err) {
      console.error('Failed to load data:', err)
      if (err.message.includes('Invalid token') || err.message.includes('No token')) {
        logout()
      }
    } finally {
      setLoading(false)
    }
  }

  const openModal = (item = null, date = null, type = null) => {
    setModalKey(prev => prev + 1)
    setEditingItem(item)
    setSelectedDate(date)
    setNoteLinkType(item?.linkType || '')
    
    if (!item && !type) {
      setModalType('select')
    } else if (item?.date || type === 'event') {
      setModalType('event')
    } else {
      setModalType('task')
    }
    
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingItem(null)
    setSelectedDate(null)
    setNoteLinkType('')
    setModalType(null)
  }

  const handleAddEvent = () => {
    setModalKey(prev => prev + 1)
    setEditingItem(null)
    setSelectedDate(new Date().toISOString().split('T')[0])
    setModalType('event')
    setModalOpen(true)
  }

  const handleAddTask = () => {
    setModalKey(prev => prev + 1)
    setEditingItem(null)
    setSelectedDate(new Date().toISOString().split('T')[0])
    setModalType('task')
    setModalOpen(true)
  }

  const handleAddNote = () => {
    setModalKey(prev => prev + 1)
    setEditingItem({ isNew: true })
    setModalType('note')
    setModalOpen(true)
  }

  const saveItem = async (e) => {
    e.preventDefault()
    const form = e.target
    const formData = new FormData(form)
    
    const title = formData.get('title')
    const desc = formData.get('desc')
    const color = formData.get('color')
    const isEvent = modalType === 'event' || editingItem?.date
    
    try {
      if (editingItem?.id) {
        if (isEvent) {
          const date = new Date(`${formData.get('date')}T${formData.get('time')}`)
          await apiCall(`/events/${editingItem.id}`, {
            method: 'PUT',
            body: JSON.stringify({ title, description: desc, color, date: date.toISOString() })
          })
          setEvents(events.map(ev => ev.id === editingItem.id ? {
            ...ev, title, description: desc, color, date: date.toISOString()
          } : ev))
        } else {
          const dueDate = `${formData.get('dueDate')}T${formData.get('dueTime') || '09:00'}`
          await apiCall(`/tasks/${editingItem.id}`, {
            method: 'PUT',
            body: JSON.stringify({ title, description: desc, color, due_date: dueDate, status: formData.get('status') })
          })
          setTasks(tasks.map(t => t.id === editingItem.id ? {
            ...t, title, description: desc, color, dueDate, status: formData.get('status')
          } : t))
        }
      } else {
        if (isEvent) {
          const date = new Date(`${formData.get('date')}T${formData.get('time') || '09:00'}`).toISOString()
          const newEvent = await apiCall('/events', {
            method: 'POST',
            body: JSON.stringify({ title, description: desc, color, date })
          })
          setEvents([...events, { ...newEvent, date: newEvent.date }])
        } else {
          const dueDate = `${formData.get('dueDate')}T${formData.get('dueTime') || '09:00'}`
          const newTask = await apiCall('/tasks', {
            method: 'POST',
            body: JSON.stringify({ title, description: desc, color, due_date: dueDate, status: formData.get('status') || 'pending' })
          })
          setTasks([...tasks, { ...newTask, dueDate: newTask.due_date }])
        }
      }
    } catch (err) {
      console.error('Failed to save item:', err)
    }
    closeModal()
  }

  const saveNote = async (e) => {
    e.preventDefault()
    const form = e.target
    const formData = new FormData(form)
    
    const title = formData.get('title')
    const content = formData.get('content')
    const linkType = formData.get('linkType')
    const linkId = formData.get('linkId')
    
    try {
      if (editingItem?.id && !editingItem.isNew) {
        await apiCall(`/notes/${editingItem.id}`, {
          method: 'PUT',
          body: JSON.stringify({ title, content, link_type: linkType || null, link_id: linkId ? parseInt(linkId) : null })
        })
        setNotes(notes.map(n => n.id === editingItem.id ? {
          ...n, title, content, link_type: linkType, link_id: linkId ? parseInt(linkId) : null
        } : n))
      } else {
        const newNote = await apiCall('/notes', {
          method: 'POST',
          body: JSON.stringify({ title, content, link_type: linkType || null, link_id: linkId ? parseInt(linkId) : null })
        })
        setNotes([...notes, { ...newNote, date: new Date().toISOString() }])
      }
    } catch (err) {
      console.error('Failed to save note:', err)
    }
    closeModal()
  }

  const deleteItem = async () => {
    try {
      if (editingItem?.date) {
        await apiCall(`/events/${editingItem.id}`, { method: 'DELETE' })
        setEvents(events.filter(e => e.id !== editingItem.id))
      } else if (editingItem?.id) {
        await apiCall(`/tasks/${editingItem.id}`, { method: 'DELETE' })
        setTasks(tasks.filter(t => t.id !== editingItem.id))
      }
    } catch (err) {
      console.error('Failed to delete item:', err)
    }
    closeModal()
  }

  const deleteNote = async () => {
    try {
      await apiCall(`/notes/${editingItem.id}`, { method: 'DELETE' })
      setNotes(notes.filter(n => n.id !== editingItem.id))
    } catch (err) {
      console.error('Failed to delete note:', err)
    }
    closeModal()
  }

  const markAsRead = async (id) => {
    try {
      await apiCall(`/notifications/${id}/read`, { method: 'PUT' })
      setNotifications(notifications.map(n => 
        n.id === id ? { ...n, unread: false } : n
      ))
    } catch (err) {
      console.error('Failed to mark as read:', err)
    }
  }

  const formatTime = (time) => {
    const date = new Date(time)
    const now = new Date()
    const diff = now - date
    
    if (diff < 60000) return 'Just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return format(date, 'MMM d')
  }

  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const todayTasks = tasks.filter(t => t.dueDate && t.dueDate.startsWith(todayStr))
  const completedToday = todayTasks.filter(t => t.status === 'completed').length
  const progressPercent = todayTasks.length > 0 ? Math.round((completedToday / todayTasks.length) * 100) : 0

  const unreadCount = notifications.filter(n => n.unread).length

  const renderCalendar = () => {
    const monthStart = startOfMonth(currentDate)
    const monthEnd = endOfMonth(monthStart)
    const startDate = startOfWeek(monthStart)
    const endDate = endOfWeek(monthEnd)

    const rows = []
    let days = []
    let day = startDate

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        const currentDay = day
        const dateStr = format(currentDay, 'yyyy-MM-dd')
        
        const dayEvents = currentView === 'event' 
          ? events.filter(e => format(new Date(e.date), 'yyyy-MM-dd') === dateStr)
          : tasks.filter(t => t.dueDate && t.dueDate.startsWith(dateStr))

        const isTodayDate = isToday(currentDay)
        const isCurrentMonth = isSameMonth(currentDay, monthStart)

        days.push(
          <div 
            key={dateStr} 
            className={`calendar-day ${!isCurrentMonth ? 'other-month' : ''} ${isTodayDate ? 'today' : ''}`}
            onClick={() => {
              setSelectedDate(dateStr)
              openModal(null, dateStr)
            }}
          >
            <div className="day-number">{format(currentDay, 'd')}</div>
            <div className="day-events">
              {dayEvents.slice(0, 3).map(item => (
                <div 
                  key={item.id}
                  className={currentView === 'event' ? 'event-chip' : `task-chip ${item.status}`}
                  style={{ background: item.color }}
                  onClick={(e) => {
                    e.stopPropagation()
                    openModal(item)
                  }}
                >
                  {currentView === 'event' 
                    ? `${format(new Date(item.date), 'HH:mm')} ${item.title}`
                    : item.title
                  }
                </div>
              ))}
            </div>
          </div>
        )
        day = addDays(day, 1)
      }
      rows.push(<div key={day.toString()} className="calendar-grid">{days}</div>)
      days = []
    }

    return rows
  }

  const openPanel = (type) => {
    setPanelOpen(panelOpen === type ? null : type)
  }

  const closePanel = () => {
    setPanelOpen(null)
  }

  if (loading) {
    return (
      <div className="auth-container">
        <div className="auth-spinner">Loading...</div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="auth-container">
        <div className="auth-box">
          <h1>Calendar App</h1>
          <p>{authMode === 'login' ? 'Sign in to your account' : 'Create a new account'}</p>
          
          <form onSubmit={handleAuth} className="auth-form">
            {authMode === 'register' && (
              <div className="form-group">
                <label className="form-label">Name</label>
                <input name="name" className="form-input" placeholder="Your name" required />
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Email</label>
              <input name="email" type="email" className="form-input" placeholder="you@example.com" required />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input name="password" type="password" className="form-input" placeholder="••••••••" required />
            </div>
            
            {authError && <div className="auth-error">{authError}</div>}
            
            <button type="submit" className="btn btn-primary auth-btn">
              {authMode === 'login' ? 'Sign In' : 'Sign Up'}
            </button>
          </form>
          
          <p className="auth-switch">
            {authMode === 'login' ? "Don't have an account? " : "Already have an account? "}
            <button onClick={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setAuthError('') }}>
              {authMode === 'login' ? 'Sign Up' : 'Sign In'}
            </button>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="app-container">
      <aside className="sidebar-left">
        <div className="sidebar-header">
          <h2>My Dashboard</h2>
          <p>Manage your events & tasks</p>
        </div>

        <div className="user-info">
          <div className="user-avatar"><User size={16} /></div>
          <div className="user-details">
            <span className="user-name">{user.name || user.email}</span>
            <button className="logout-btn" onClick={logout}><LogOut size={14} /> Logout</button>
          </div>
        </div>

        <div className="sidebar-progress">
          <div className="sidebar-progress-label">
            <span>Today's Progress</span>
            <span>{progressPercent}%</span>
          </div>
          <div className="sidebar-progress-bar">
            <div className="sidebar-progress-fill" style={{ width: `${progressPercent}%` }}></div>
          </div>
          <p className="sidebar-progress-text">
            {completedToday} of {todayTasks.length} tasks completed today
          </p>
        </div>

        <div className="sidebar-actions">
          <button 
            className={`sidebar-action-btn ${panelOpen === 'notifications' ? 'active' : ''}`}
            onClick={() => openPanel('notifications')}
          >
            <Bell size={20} strokeWidth={2} />
            <span>Notifications</span>
            {unreadCount > 0 && (
              <span className="sidebar-badge">{unreadCount}</span>
            )}
          </button>
          
          <button 
            className={`sidebar-action-btn ${panelOpen === 'notes' ? 'active' : ''}`}
            onClick={() => openPanel('notes')}
          >
            <FileText size={20} strokeWidth={2} />
            <span>Notes</span>
          </button>
        </div>
        
        <div className="sidebar-section">
          <div className="section-title">
            <Calendar size={14} />
            Upcoming Events
          </div>
          {events.slice(0, 3).map(event => (
            <div 
              key={event.id} 
              className="project-item"
              onClick={() => openModal(event)}
            >
              <div className="project-item-title">
                <span className="dot" style={{ background: event.color }}></span>
                {event.title}
              </div>
              <div className="project-item-date">
                {format(new Date(event.date), 'MMM d, h:mm a')}
              </div>
            </div>
          ))}
        </div>

        <div className="sidebar-section">
          <div className="section-title">
            <CheckSquare size={14} />
            Today's Tasks
          </div>
          {todayTasks.length > 0 ? todayTasks.slice(0, 3).map(task => (
            <div 
              key={task.id} 
              className="project-item"
              onClick={() => openModal(task)}
            >
              <div className="project-item-title">
                <span className="dot" style={{ background: task.color }}></span>
                {task.title}
              </div>
              <div className="project-item-date">
                {task.dueDate ? format(new Date(task.dueDate), 'h:mm a') : ''} • {task.status}
              </div>
              {notes.filter(n => n.link_type === 'task' && n.link_id === task.id).length > 0 && (
                <div className="linked-notes-count">
                  {notes.filter(n => n.link_type === 'task' && n.link_id === task.id).length} note(s)
                </div>
              )}
            </div>
          )) : (
            <p className="no-tasks">No tasks for today</p>
          )}
        </div>

        {events.slice(0, 3).map(event => {
          const linkedNotes = notes.filter(n => n.link_type === 'event' && n.link_id === event.id)
          if (linkedNotes.length === 0) return null
          return (
            <div key={`notes-${event.id}`} className="sidebar-section linked-notes-section">
              <div className="section-title">
                <FileText size={14} />
                Notes for {event.title}
              </div>
              {linkedNotes.map(note => (
                <div key={note.id} className="project-item linked-note" onClick={() => { setEditingItem(note); setModalType('note'); setModalOpen(true) }}>
                  <div className="project-item-title">{note.title}</div>
                  <div className="project-item-desc">{note.content?.substring(0, 50)}...</div>
                </div>
              ))}
            </div>
          )
        })}

        <div className="sidebar-footer">
          <button className="collapse-btn" onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
            {sidebarCollapsed ? '▲' : '▼'} {sidebarCollapsed ? 'Expand' : 'Collapse'}
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="header">
          <div className="header-left">
            <h1>Dashboard</h1>
            <p>{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
          </div>
          
          <div className="header-actions">
            <div className="search-box">
              <Search size={18} />
              <input type="text" placeholder="Search..." />
            </div>
            
            <div className="toggle-container">
              <button 
                className={`toggle-btn ${currentView === 'event' ? 'active' : ''}`}
                onClick={() => setCurrentView('event')}
              >
                <Calendar size={18} />
                Events
              </button>
              <button 
                className={`toggle-btn ${currentView === 'task' ? 'active' : ''}`}
                onClick={() => setCurrentView('task')}
              >
                <CheckSquare size={18} />
                Tasks
              </button>
            </div>

            <button className="add-btn-main" onClick={() => setModalType('select')}>
              <Plus size={24} />
            </button>
          </div>
        </header>

        <div className="calendar-nav">
          <h2 className="month-year">{format(currentDate, 'MMMM yyyy')}</h2>
          <div className="nav-buttons">
            <button className="nav-btn" onClick={() => setCurrentDate(subMonths(currentDate, 1))}>
              <ChevronLeft size={18} />
            </button>
            <button className="nav-btn" onClick={() => setCurrentDate(addMonths(currentDate, 1))}>
              <ChevronRight size={18} />
            </button>
            <button className="today-btn" onClick={() => setCurrentDate(new Date())}>
              Today
            </button>
          </div>
        </div>

        <div className="calendar-container">
          <div className="calendar-header">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="calendar-header-day">{day}</div>
            ))}
          </div>
          {renderCalendar()}
        </div>
      </main>

      <div 
        className={`panel-overlay ${panelOpen ? 'active' : ''}`}
        onClick={closePanel}
      ></div>

      <div className={`panel ${panelOpen === 'notifications' ? 'active' : ''}`}>
        <div className="panel-header">
          <h2>Notifications</h2>
          <button className="panel-btn" onClick={closePanel}>
            <X size={16} />
          </button>
        </div>
        <div className="panel-content">
          {notifications.length === 0 ? (
            <div className="empty-state">
              <Bell size={56} />
              <p>No notifications</p>
            </div>
          ) : (
            notifications.map(notif => (
              <div 
                key={notif.id}
                className={`panel-item ${notif.unread ? 'unread' : ''}`}
                onClick={() => markAsRead(notif.id)}
              >
                <div className="panel-item-title">
                  {notif.unread && <span style={{ color: '#e07b39' }}>●</span>}
                  {notif.title}
                </div>
                <div className="panel-item-desc">{notif.description}</div>
                <div className="panel-item-date">{formatTime(notif.created_at)}</div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className={`panel ${panelOpen === 'notes' ? 'active' : ''}`}>
        <div className="panel-header">
          <h2>Notes</h2>
          <div className="panel-actions">
            <button className="panel-btn add-btn" onClick={() => {
              setEditingItem({ isNew: true })
              setModalOpen(true)
            }}>
              <Plus size={16} />
            </button>
            <button className="panel-btn" onClick={closePanel}>
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="panel-content">
          {notes.length === 0 ? (
            <div className="empty-state">
              <FileText size={56} />
              <p>No notes yet</p>
            </div>
          ) : (
            notes.map(note => (
              <div 
                key={note.id}
                className="panel-item"
                onClick={() => {
                  setEditingItem(note)
                  setModalOpen(true)
                }}
              >
                <div className="panel-item-title">
                  {note.title}
                  {note.link_type && <span className="link-badge">{note.link_type}</span>}
                </div>
                <div className="panel-item-desc">{note.content}</div>
                <div className="panel-item-date">{format(new Date(note.created_at), 'MMM d, yyyy')}</div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className={`modal-overlay ${modalOpen ? 'active' : ''}`}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h2>
              {modalType === 'select' ? 'Add New' :
               modalType === 'note' ? 'Add Note' : 
               editingItem?.id ? (editingItem.date ? 'Edit Event' : 'Edit Task') :
               modalType === 'event' ? 'Add Event' : 'Add Task'}
            </h2>
            <button className="modal-close" onClick={closeModal}>
              <X size={16} />
            </button>
          </div>
          
          <div className="modal-body">
            {modalType === 'select' ? (
              <div className="type-select">
                <button type="button" className="type-option" onClick={handleAddEvent}>
                  <Calendar size={32} />
                  <span>Event</span>
                </button>
                <button type="button" className="type-option" onClick={handleAddTask}>
                  <CheckSquare size={32} />
                  <span>Task</span>
                </button>
                <button type="button" className="type-option" onClick={handleAddNote}>
                  <FileText size={32} />
                  <span>Note</span>
                </button>
              </div>
            ) : modalType === 'note' ? (
              <form onSubmit={saveNote} key={`note-form-${modalKey}`}>
                <div className="form-group">
                  <label className="form-label">Title</label>
                  <input name="title" className="form-input" placeholder="Note title" defaultValue={editingItem?.title || ''} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Link to Event or Task</label>
                  <select name="linkType" className="form-select" value={noteLinkType} onChange={(e) => setNoteLinkType(e.target.value)}>
                    <option value="">None</option>
                    <option value="event">Event</option>
                    <option value="task">Task</option>
                  </select>
                </div>
                {noteLinkType === 'event' && (
                  <div className="form-group">
                    <label className="form-label">Select Event</label>
                    <select name="linkId" className="form-select" defaultValue={editingItem?.link_id || ''}>
                      <option value="">Select an event</option>
                      {events.map(ev => (<option key={ev.id} value={ev.id}>{ev.title}</option>))}
                    </select>
                  </div>
                )}
                {noteLinkType === 'task' && (
                  <div className="form-group">
                    <label className="form-label">Select Task</label>
                    <select name="linkId" className="form-select" defaultValue={editingItem?.link_id || ''}>
                      <option value="">Select a task</option>
                      {tasks.map(t => (<option key={t.id} value={t.id}>{t.title}</option>))}
                    </select>
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Content</label>
                  <textarea name="content" className="form-textarea" placeholder="Write your note..." defaultValue={editingItem?.content || ''}></textarea>
                </div>
                <div className="modal-footer">
                  {editingItem?.id && !editingItem?.isNew && (
                    <button type="button" className="btn btn-danger" onClick={deleteNote}><Trash2 size={16} />Delete</button>
                  )}
                  <button type="button" className="btn btn-secondary" onClick={closeModal}><X size={16} />Cancel</button>
                  <button type="submit" className="btn btn-primary"><Save size={16} />Save</button>
                </div>
              </form>
            ) : (
              <form onSubmit={saveItem} key={`item-form-${modalKey}`}>
                <div className="form-group">
                  <label className="form-label">Title</label>
                  <input name="title" className="form-input" placeholder="Enter title" defaultValue={editingItem?.title || ''} required />
                </div>
                {modalType === 'event' ? (
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Date</label>
                      <input name="date" type="date" className="form-input" defaultValue={editingItem?.date ? format(new Date(editingItem.date), 'yyyy-MM-dd') : selectedDate || ''} required />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Time</label>
                      <input name="time" type="time" className="form-input" defaultValue={editingItem?.date ? format(new Date(editingItem.date), 'HH:mm') : '09:00'} />
                    </div>
                  </div>
                ) : (
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Due Date</label>
                      <input name="dueDate" type="date" className="form-input" defaultValue={editingItem?.dueDate ? editingItem.dueDate.split('T')[0] : selectedDate || ''} required />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Due Time</label>
                      <input name="dueTime" type="time" className="form-input" defaultValue={editingItem?.dueDate ? editingItem.dueDate.split('T')[1]?.slice(0,5) : '09:00'} />
                    </div>
                  </div>
                )}
                {modalType === 'task' && (
                  <div className="form-group">
                    <label className="form-label">Status</label>
                    <select name="status" className="form-select" defaultValue={editingItem?.status || 'pending'}>
                      <option value="pending">Pending</option>
                      <option value="in-progress">In Progress</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea name="desc" className="form-textarea" placeholder="Add description..." defaultValue={editingItem?.description || ''}></textarea>
                </div>
                <div className="form-group">
                  <label className="form-label">Color</label>
                  <div className="color-options">
                    {COLORS.map(color => (
                      <div key={color} className={`color-option ${editingItem?.color === color ? 'selected' : ''}`} style={{ background: color }} onClick={() => {
                        document.querySelector('input[name="color"]').value = color
                        document.querySelectorAll('.color-option').forEach(el => { el.classList.toggle('selected', el.style.background === color) })
                      }}></div>
                    ))}
                  </div>
                  <input type="hidden" name="color" value={editingItem?.color || COLORS[0]} />
                </div>
                <div className="modal-footer">
                  {editingItem?.id && !editingItem?.isNew && (
                    <button type="button" className="btn btn-danger" onClick={deleteItem}><Trash2 size={16} />Delete</button>
                  )}
                  <button type="button" className="btn btn-secondary" onClick={closeModal}><X size={16} />Cancel</button>
                  <button type="submit" className="btn btn-primary"><Save size={16} />Save</button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
