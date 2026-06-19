// Seeds the `reservations` collection with mock data, including repeat
// guests so the loyalty/CLV view (build order step 10) has something to
// aggregate. Run with: node src/scripts/seedReservations.js
// Note: unlike seed.js, this uses auto-generated doc IDs (no natural
// unique key in the §4 reservations schema) — re-running will duplicate.
import 'dotenv/config'
import { db } from '../firebaseAdmin.js'

if (!db) {
  console.error('Firestore not initialized — check FIREBASE_SERVICE_ACCOUNT in backend/.env')
  process.exit(1)
}

const now = new Date()
function hoursFromNow(h) {
  return new Date(now.getTime() + h * 60 * 60 * 1000)
}

const reservations = [
  { guest_name: 'Nguyen Van An', party_size: 2, reservation_time: hoursFromNow(-48), status: 'completed', contact: '0901111111' },
  { guest_name: 'Nguyen Van An', party_size: 2, reservation_time: hoursFromNow(-24), status: 'completed', contact: '0901111111' },
  { guest_name: 'Nguyen Van An', party_size: 4, reservation_time: hoursFromNow(2), status: 'confirmed', contact: '0901111111' },
  { guest_name: 'Tran Thi Bich', party_size: 3, reservation_time: hoursFromNow(-72), status: 'completed', contact: '0902222222' },
  { guest_name: 'Tran Thi Bich', party_size: 2, reservation_time: hoursFromNow(-12), status: 'completed', contact: '0902222222' },
  { guest_name: 'Le Hoang Long', party_size: 5, reservation_time: hoursFromNow(-96), status: 'completed', contact: '0903333333' },
  { guest_name: 'Le Hoang Long', party_size: 4, reservation_time: hoursFromNow(-36), status: 'completed', contact: '0903333333' },
  { guest_name: 'Le Hoang Long', party_size: 2, reservation_time: hoursFromNow(5), status: 'confirmed', contact: '0903333333' },
  { guest_name: 'Pham Minh Chau', party_size: 2, reservation_time: hoursFromNow(1), status: 'confirmed', contact: '0904444444' },
  { guest_name: 'Vo Thi Dao', party_size: 6, reservation_time: hoursFromNow(3), status: 'confirmed', contact: '0905555555' },
  { guest_name: 'Dang Quoc Huy', party_size: 2, reservation_time: hoursFromNow(-6), status: 'cancelled', contact: '0906666666' },
]

async function seed() {
  const batch = db.batch()
  reservations.forEach((r) => {
    const ref = db.collection('reservations').doc()
    batch.set(ref, r)
  })
  await batch.commit()
  console.log(`Seeded ${reservations.length} docs into "reservations"`)
  process.exit(0)
}

await seed()
