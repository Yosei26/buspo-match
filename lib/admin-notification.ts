import "server-only";

export type InquiryNotificationPayload = {
  inquiryId: string;
  postId: string;
  postTitle: string;
  postOwnerEmail: string;
  senderEmail: string;
  message: string;
};

function notificationRecipients() {
  return (process.env.ADMIN_NOTIFICATION_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
}

export async function notifyAdminsOfNewInquiry(payload: InquiryNotificationPayload) {
  const recipients = notificationRecipients();

  // No external email is sent yet. This is a server-side integration point for a future mail provider.
  console.info("admin inquiry notification prepared", {
    inquiryId: payload.inquiryId,
    postId: payload.postId,
    postTitle: payload.postTitle,
    hasSenderEmail: Boolean(payload.senderEmail),
    hasPostOwnerEmail: Boolean(payload.postOwnerEmail),
    messageLength: payload.message.length,
    recipientCount: recipients.length,
    mailProviderConfigured: Boolean(process.env.MAIL_PROVIDER_API_KEY)
  });
}
