import { SignIn } from "@clerk/nextjs";

export default function Page() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: '20vh', justifyContent: 'center' }}>
      <div style={{
        background: '#f5f5fa',
        border: '1px solid #ddd',
        borderRadius: '8px',
        padding: '16px 24px',
        marginBottom: '16px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        maxWidth: '340px',
        width: '100%',
        textAlign: 'center',
        color: '#333',
        fontSize: '1rem'
      }}>
        <strong>Try our website with a test account!</strong>
        <div style={{ marginTop: '1px', fontSize: '0.97rem' }}>
          <div><b>Username:</b> <span style={{ fontFamily: 'monospace' }}>trialUser</span></div>
          <div><b>Password:</b> <span style={{ fontFamily: 'monospace' }}>User@192</span></div>
        </div>
      </div>
      <SignIn path="/sign-in" />
    </div>
  );
}
