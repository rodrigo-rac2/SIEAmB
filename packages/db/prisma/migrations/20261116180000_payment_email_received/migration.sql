-- "Registration received" e-mail (#195), sent when the form is submitted,
-- whatever happens with the payment.

-- AlterEnum
ALTER TYPE "PaymentEmailKind" ADD VALUE 'RECEIVED';
