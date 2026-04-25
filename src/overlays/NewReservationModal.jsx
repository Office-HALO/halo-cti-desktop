import ReservationFormModal from './ReservationFormModal.jsx';

// Backwards-compatible thin wrapper for create-only usage.
export default function NewReservationModal({ customer, onClose, onCreated }) {
  return (
    <ReservationFormModal
      customer={customer}
      onClose={onClose}
      onSaved={onCreated}
    />
  );
}
