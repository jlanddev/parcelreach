import Link from 'next/link';

export default function RefundPolicyPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <Link href="/" className="inline-block mb-8">
          <img src="/logo.png" alt="GarageLeadly" className="h-16" />
        </Link>

        <h1 className="text-4xl font-bold text-gray-900 mb-8">Refund Policy</h1>

        <div className="prose prose-lg max-w-none">
          <p className="text-gray-600 mb-6"><strong>Last Updated:</strong> November 13, 2025</p>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Overview</h2>
            <p className="text-gray-700 mb-4">
              This refund policy applies to all services provided by LR Acquisitions LLC d/b/a GarageLeadly ("GarageLeadly," "we," "us," or "our"). By using our lead generation services, you agree to this refund policy.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Lead Credits and Refunds</h2>
            <p className="text-gray-700 mb-4">
              We stand behind the quality of our leads. If you receive a lead that does not meet our quality standards, you may be eligible for a credit or refund under the following conditions:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
              <li>The lead contains incorrect or fraudulent contact information</li>
              <li>The lead is a duplicate of a previous lead sent to you within 30 days</li>
              <li>The customer location is outside your designated service territory</li>
              <li>The lead does not match the service type you subscribed to receive</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Refund Request Process</h2>
            <p className="text-gray-700 mb-4">
              To request a refund or credit for a lead:
            </p>
            <ol className="list-decimal pl-6 text-gray-700 space-y-2 mb-4">
              <li>Contact us at <a href="mailto:support@parcelreach.ai" className="text-blue-600 hover:underline">support@parcelreach.ai</a> within 72 hours of receiving the lead</li>
              <li>Provide the lead ID, date received, and detailed reason for the refund request</li>
              <li>Include any supporting documentation (screenshots, call logs, etc.)</li>
            </ol>
            <p className="text-gray-700 mb-4">
              We will review your request within 2 business days and respond with our decision. Approved refunds will be issued as account credits or processed back to your original payment method within 5-7 business days.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Non-Refundable Circumstances</h2>
            <p className="text-gray-700 mb-4">
              Leads are NOT eligible for refund in the following situations:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
              <li>Customer does not answer or return your call (no-contact leads)</li>
              <li>Customer chooses a competitor or decides not to proceed with service</li>
              <li>You determine the job is too small, too large, or not profitable</li>
              <li>Customer pricing expectations do not align with your pricing</li>
              <li>Refund request is made more than 72 hours after lead delivery</li>
              <li>General dissatisfaction with lead quality without specific documented issues</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Subscription and Membership Fees</h2>
            <p className="text-gray-700 mb-4">
              Membership fees and subscription charges are non-refundable. You may cancel your subscription at any time, and cancellation will be effective at the end of your current billing period. No refunds will be issued for partial months or unused subscription time.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Account Credits</h2>
            <p className="text-gray-700 mb-4">
              Approved refunds may be issued as account credits that can be applied to future lead purchases. Account credits do not expire and remain available until used or your account is closed.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Changes to This Policy</h2>
            <p className="text-gray-700 mb-4">
              We reserve the right to modify this refund policy at any time. Changes will be effective immediately upon posting to our website. Your continued use of our services after changes are posted constitutes acceptance of the modified policy.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Contact Information</h2>
            <p className="text-gray-700 mb-2">
              <strong>LR Acquisitions LLC d/b/a GarageLeadly</strong><br />
              32 North Gould Street<br />
              Sheridan, WY 82801<br />
              United States
            </p>
            <p className="text-gray-700">
              Email: <a href="mailto:support@parcelreach.ai" className="text-blue-600 hover:underline">support@parcelreach.ai</a>
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t">
          <Link href="/" className="text-blue-600 hover:underline">
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
