<?php
use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

require __DIR__ . '/../vendor/autoload.php'; // install with composer: composer require phpmailer/phpmailer

/**
 * EmailSender Class
 * Handles sending verification emails with OTP codes
 */
class EmailSender {
    private $smtpHost;
    private $smtpPort;
    private $smtpUsername;
    private $smtpPassword;
    private $fromEmail;
    private $fromName;
    /** @var bool When false, sendGmailSMTP returns error without throwing (caller can use mail() fallback). */
    private $smtpConfigured = false;
    
    public function __construct() {
        // Load environment variables
        require_once __DIR__ . '/env_loader.php';
        
        // Email configuration from environment variables
        $h = $_ENV['SMTP_HOST'] ?? getenv('SMTP_HOST');
        $this->smtpHost = ($h !== false && $h !== null && $h !== '') ? $h : null;
        $p = $_ENV['SMTP_PORT'] ?? getenv('SMTP_PORT');
        $this->smtpPort = ($p !== false && $p !== null && $p !== '') ? (int) $p : null;
        $u = $_ENV['SMTP_USER'] ?? getenv('SMTP_USER');
        $this->smtpUsername = ($u !== false && $u !== null && $u !== '') ? $u : null;
        $pw = $_ENV['SMTP_PASS'] ?? getenv('SMTP_PASS');
        $this->smtpPassword = ($pw !== false && $pw !== null && $pw !== '') ? $pw : null;
        $fe = $_ENV['SMTP_FROM_EMAIL'] ?? getenv('SMTP_FROM_EMAIL');
        $this->fromEmail = ($fe !== false && $fe !== null && $fe !== '') ? $fe : null;
        $fn = $_ENV['SMTP_FROM_NAME'] ?? getenv('SMTP_FROM_NAME');
        $this->fromName = ($fn !== false && $fn !== null && $fn !== '') ? $fn : null;
        
        if ($this->smtpHost && $this->smtpPort && $this->smtpUsername && $this->smtpPassword && $this->fromEmail && $this->fromName) {
            $this->smtpConfigured = true;
            ini_set('SMTP', $this->smtpHost);
            ini_set('smtp_port', (string)$this->smtpPort);
            ini_set('sendmail_from', $this->fromEmail);
            ini_set('smtp_ssl', 'tls');
        } else {
            error_log('EmailSender: SMTP not fully configured — PHPMailer sends will fail until .env has SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM_EMAIL, SMTP_FROM_NAME');
        }
    }

    public function isSmtpConfigured(): bool {
        return $this->smtpConfigured;
    }
    
    /**
     * Send OTP verification email
     */
    public function sendOTPEmail($toEmail, $otpCode, $fullName) {
        try {
            $subject = 'RICH Bigte - Email Verification Code';
            $message = $this->getOTPEmailTemplate($otpCode, $fullName);
            
            // Always log the OTP for testing
            error_log("=== OTP CODE FOR TESTING ===");
            error_log("Email: " . $toEmail);
            error_log("OTP Code: " . $otpCode);
            error_log("Full Name: " . $fullName);
            error_log("=============================");
            
            // Try to send actual email using Gmail SMTP
            $result = $this->sendGmailSMTP($toEmail, $subject, $message);
            
            if ($result['success']) {
                error_log("✓ Email sent successfully via SMTP to: " . $toEmail);
                return [
                    'success' => true,
                    'message' => 'Verification email sent successfully to your email',
                    'otp_code' => $otpCode // Include OTP for testing
                ];
            } else {
                // Log detailed error but still provide OTP for testing
                error_log("✗ PHPMailer failed!");
                error_log("  - SMTP Error: " . $result['message']);
                error_log("  - OTP Code: " . $otpCode . " (for manual testing)");
                
                // Return failure but include OTP for development/testing
                return [
                    'success' => false,
                    'message' => 'Failed to send email. Please check server logs for OTP code or contact support.',
                    'error' => 'Email delivery failed: ' . $result['message'],
                    'otp_code' => $otpCode // Still include OTP for testing/debugging
                ];
            }
            
        } catch (Exception $e) {
            error_log("✗ Exception in sendOTPEmail: " . $e->getMessage());
            error_log("Stack trace: " . $e->getTraceAsString());
            return [
                'success' => false,
                'message' => 'Email sending error occurred. Please check server logs for OTP code.',
                'error' => $e->getMessage(),
                'otp_code' => $otpCode // Still include OTP for testing/debugging
            ];
        }
    }

    /**
     * Send OTP for profile email change (new email address).
     * Body highlights: "This OTP to change your email in RICH APP"
     */
    public function sendEmailChangeOTPEmail($toEmail, $otpCode, $fullName) {
        try {
            $subject = 'RICH APP — OTP to change your email';
            $message = $this->getEmailChangeOTPTemplate($otpCode, $fullName);

            error_log("=== EMAIL CHANGE OTP (RICH APP) ===");
            error_log("To: " . $toEmail);
            error_log("OTP Code: " . $otpCode);
            error_log("===================================");

            $result = $this->sendGmailSMTP($toEmail, $subject, $message);

            if ($result['success']) {
                error_log("✓ Email change OTP sent to: " . $toEmail);
                return [
                    'success' => true,
                    'message' => 'Verification code sent to your new email',
                    'otp_code' => $otpCode,
                ];
            }

            error_log("✗ Email change OTP SMTP failed: " . ($result['message'] ?? ''));
            return [
                'success' => false,
                'message' => 'Failed to send email. Check SMTP settings or server logs.',
                'error' => $result['message'] ?? 'SMTP error',
                'otp_code' => $otpCode,
            ];
        } catch (Exception $e) {
            error_log("✗ sendEmailChangeOTPEmail: " . $e->getMessage());
            return [
                'success' => false,
                'message' => 'Email sending error: ' . $e->getMessage(),
                'error' => $e->getMessage(),
                'otp_code' => $otpCode,
            ];
        }
    }

    /**
     * Send email using PHPMailer with Gmail SMTP
     */
    private function sendGmailSMTP($toEmail, $subject, $message) {
        if (!$this->smtpConfigured) {
            return [
                'success' => false,
                'message' => 'SMTP is not configured (.env). Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM_EMAIL, SMTP_FROM_NAME.',
            ];
        }
        try {
            $mail = new PHPMailer(true);

            // Enable verbose debug output (level 2 = client and server messages)
            // $mail->SMTPDebug = 2; // Uncomment for detailed debugging
            $mail->Debugoutput = function($str, $level) {
                error_log("PHPMailer Debug (Level $level): $str");
            };

            //Server settings
            $mail->isSMTP();
            $mail->Host       = $this->smtpHost;
            $mail->SMTPAuth   = true;
            $mail->Username   = $this->smtpUsername;
            $mail->Password   = $this->smtpPassword;
            $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
            $mail->Port       = $this->smtpPort;
            $mail->CharSet    = 'UTF-8';
            
            // Additional SMTP options for better reliability
            $mail->SMTPOptions = array(
                'ssl' => array(
                    'verify_peer' => false,
                    'verify_peer_name' => false,
                    'allow_self_signed' => true
                )
            );

            //Recipients
            $mail->setFrom($this->fromEmail, $this->fromName);
            $mail->addAddress($toEmail);

            //Content
            $mail->isHTML(true);
            $mail->Subject = $subject;
            $mail->Body    = $message;
            $mail->AltBody = strip_tags($message); // Plain text version

            $mail->send();
            
            error_log("✓ Email sent successfully via SMTP to: " . $toEmail);
            return [
                'success' => true,
                'message' => 'Email sent successfully via PHPMailer'
            ];
            
        } catch (Exception $e) {
            $errorMessage = $e->getMessage();
            error_log("✗ PHPMailer SMTP Error Details:");
            error_log("  - Error: " . $errorMessage);
            error_log("  - SMTP Host: " . $this->smtpHost);
            error_log("  - SMTP Port: " . $this->smtpPort);
            error_log("  - From Email: " . $this->fromEmail);
            error_log("  - To Email: " . $toEmail);
            
            // Check for common SMTP errors
            if (strpos($errorMessage, 'SMTP connect() failed') !== false) {
                $errorMessage .= ' - Check SMTP server connection and credentials';
            } elseif (strpos($errorMessage, 'Authentication failed') !== false) {
                $errorMessage .= ' - Check Gmail app password is correct';
            } elseif (strpos($errorMessage, 'Could not instantiate mail function') !== false) {
                $errorMessage .= ' - PHP mail() function not configured';
            }
            
            return [
                'success' => false,
                'message' => 'PHPMailer Error: ' . $errorMessage,
                'detailed_error' => $errorMessage
            ];
        }
    }
    
    /**
     * Fallback email sending using PHP mail() function
     */
    private function sendMailFunction($toEmail, $subject, $message) {
        $headers = [
            'From: ' . $this->fromName . ' <' . $this->fromEmail . '>',
            'Reply-To: ' . $this->fromEmail,
            'Content-Type: text/html; charset=UTF-8',
            'MIME-Version: 1.0'
        ];
        
        $mailSent = mail($toEmail, $subject, $message, implode("\r\n", $headers));
        
        if ($mailSent) {
            return [
                'success' => true,
                'message' => 'Email sent successfully via mail() function'
            ];
        } else {
            return [
                'success' => false,
                'message' => 'Failed to send email using mail() function. Please check your server configuration.'
            ];
        }
    }
    
    /**
     * Get OTP email template
     */
    private function getOTPEmailTemplate($otpCode, $fullName) {
        // Ensure OTP code is a string and not empty
        $otpCode = (string) trim($otpCode);
        if (empty($otpCode)) {
            $otpCode = 'N/A';
        }
        
        return "
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset='UTF-8'>
            <meta name='viewport' content='width=device-width, initial-scale=1.0'>
            <title>Email Verification</title>
            <style>
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                    background-color: #f4f4f4;
                }
                .container {
                    background-color: #ffffff;
                    padding: 40px;
                    border-radius: 10px;
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                }
                .header {
                    text-align: center;
                    margin-bottom: 30px;
                }
                .logo {
                    font-size: 28px;
                    font-weight: bold;
                    color: #2563eb;
                    margin-bottom: 10px;
                }
                .otp-code {
                    background-color: #f8fafc;
                    border: 2px solid #e2e8f0;
                    border-radius: 8px;
                    padding: 20px;
                    text-align: center;
                    margin: 30px 0;
                    font-size: 32px;
                    font-weight: bold;
                    color: #1e40af;
                    letter-spacing: 5px;
                    font-family: 'Courier New', monospace;
                    display: block;
                    min-height: 50px;
                    line-height: 50px;
                }
                .warning {
                    background-color: #fef3c7;
                    border-left: 4px solid #f59e0b;
                    padding: 15px;
                    margin: 20px 0;
                    border-radius: 4px;
                }
                .footer {
                    text-align: center;
                    margin-top: 30px;
                    padding-top: 20px;
                    border-top: 1px solid #e5e7eb;
                    color: #6b7280;
                    font-size: 14px;
                }
                .button {
                    display: inline-block;
                    background-color: #2563eb;
                    color: white;
                    padding: 12px 24px;
                    text-decoration: none;
                    border-radius: 6px;
                    margin: 20px 0;
                }
            </style>
        </head>
        <body>
            <div class='container'>
                <div class='header'>
                    <div class='logo'>RICH Bigte</div>
                    <h1>Email Verification</h1>
                </div>
                
                <p>Hello " . htmlspecialchars($fullName) . ",</p>
                
                <p>Thank you for registering with RICH Bigte! To complete your account setup, please use the verification code below:</p>
                
                <div class='otp-code'>" . htmlspecialchars($otpCode, ENT_QUOTES, 'UTF-8') . "</div>
                
                <p style='text-align: center; margin-top: 20px;'><strong>Your One-time Code: " . htmlspecialchars($otpCode, ENT_QUOTES, 'UTF-8') . "</strong></p>
                
                <p>This code will expire in <strong>3 minutes</strong> for security purposes.</p>
                
                <div class='warning'>
                    <strong>Important:</strong> Never share this code with anyone. RICH Bigte will never ask for your verification code via phone or email.
                </div>
                
                <p>If you didn't request this verification code, please ignore this email or contact our support team.</p>
                
                <div class='footer'>
                    <p>This is an automated message from RICH Bigte. Please do not reply to this email.</p>
                    <p>&copy; " . date('Y') . " RICH Bigte. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>";
    }

    /**
     * HTML template for email-change OTP (profile)
     */
    private function getEmailChangeOTPTemplate($otpCode, $fullName) {
        $otpCode = (string) trim($otpCode);
        if ($otpCode === '') {
            $otpCode = 'N/A';
        }
        $name = htmlspecialchars(trim($fullName) ?: 'Resident', ENT_QUOTES, 'UTF-8');
        $codeEsc = htmlspecialchars($otpCode, ENT_QUOTES, 'UTF-8');

        return "
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset='UTF-8'>
            <meta name='viewport' content='width=device-width, initial-scale=1.0'>
            <title>RICH APP — Email change</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f4f4f4; }
                .container { background-color: #ffffff; padding: 40px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); }
                .header { text-align: center; margin-bottom: 24px; }
                .logo { font-size: 26px; font-weight: bold; color: #17a2b8; margin-bottom: 8px; }
                .lead { font-size: 1.1rem; color: #1e293b; margin: 20px 0; font-weight: 600; }
                .otp-code { background-color: #f0fdfa; border: 2px solid #99f6e4; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0; font-size: 32px; font-weight: bold; color: #0f766e; letter-spacing: 6px; font-family: 'Courier New', monospace; }
                .expiry-notice { background: #fffbeb; border-left: 4px solid #f59e0b; padding: 14px 16px; margin: 20px 0; border-radius: 6px; font-size: 1rem; color: #92400e; }
                .footer { text-align: center; margin-top: 28px; padding-top: 18px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px; }
            </style>
        </head>
        <body>
            <div class='container'>
                <div class='header'>
                    <div class='logo'>RICH APP</div>
                </div>
                <p>Hello {$name},</p>
                <p class='lead'>This OTP to change your email in RICH APP.</p>
                <p>Enter this 6-digit code in the app to confirm your new email address:</p>
                <div class='otp-code'>{$codeEsc}</div>
                <div class='expiry-notice'><strong>The OTP will expire in 3 minutes.</strong> Enter it in the app before it expires.</div>
                <p>If you did not request this change, you can ignore this email.</p>
                <div class='footer'>
                    <p>This is an automated message from RICH APP. Please do not reply.</p>
                    <p>&copy; " . date('Y') . " RICH APP</p>
                </div>
            </div>
        </body>
        </html>";
    }
    
    /**
     * Send welcome email after successful verification
     */
    public function sendWelcomeEmail($toEmail, $fullName) {
        try {
            $subject = 'Welcome to RICH Bigte!';
            $message = $this->getWelcomeEmailTemplate($fullName);
            
            // Try SMTP first, then fallback to mail() function
            $result = $this->sendGmailSMTP($toEmail, $subject, $message);
            
            if ($result['success']) {
                error_log("Welcome email sent via SMTP to: " . $toEmail);
                return [
                    'success' => true,
                    'message' => 'Welcome email sent successfully via SMTP'
                ];
            } else {
                // Fallback to mail() function if SMTP fails
                error_log("SMTP failed for welcome email, trying mail() function: " . $result['message']);
                $mailResult = $this->sendMailFunction($toEmail, $subject, $message);
                
                if ($mailResult['success']) {
                    error_log("Welcome email sent via mail() to: " . $toEmail);
                    return [
                        'success' => true,
                        'message' => 'Welcome email sent successfully via mail()'
                    ];
                } else {
                    error_log("Welcome email failed: " . $mailResult['message']);
                    return [
                        'success' => false,
                        'message' => 'Welcome email sending failed: ' . $mailResult['message']
                    ];
                }
            }
            
        } catch (Exception $e) {
            error_log("Welcome email sending error: " . $e->getMessage());
            return [
                'success' => false,
                'message' => 'Welcome email sending failed: ' . $e->getMessage()
            ];
        }
    }
    
    /**
     * Get welcome email template
     */
    private function getWelcomeEmailTemplate($fullName) {
        return "
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset='UTF-8'>
            <meta name='viewport' content='width=device-width, initial-scale=1.0'>
            <title>Welcome to RICH Bigte</title>
            <style>
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                    background-color: #f4f4f4;
                }
                .container {
                    background-color: #ffffff;
                    padding: 40px;
                    border-radius: 10px;
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                }
                .header {
                    text-align: center;
                    margin-bottom: 30px;
                }
                .logo {
                    font-size: 28px;
                    font-weight: bold;
                    color: #2563eb;
                    margin-bottom: 10px;
                }
                .success-icon {
                    font-size: 48px;
                    color: #10b981;
                    margin: 20px 0;
                }
                .button {
                    display: inline-block;
                    background-color: #2563eb;
                    color: white;
                    padding: 12px 24px;
                    text-decoration: none;
                    border-radius: 6px;
                    margin: 20px 0;
                }
                .footer {
                    text-align: center;
                    margin-top: 30px;
                    padding-top: 20px;
                    border-top: 1px solid #e5e7eb;
                    color: #6b7280;
                    font-size: 14px;
                }
            </style>
        </head>
        <body>
            <div class='container'>
                <div class='header'>
                    <div class='logo'>RICH Bigte</div>
                    <div class='success-icon'>✓</div>
                    <h1>Welcome to RICH Bigte!</h1>
                </div>
                
                <p>Hello " . htmlspecialchars($fullName) . ",</p>
                
                <p>Congratulations! Your email has been successfully verified and your RICH Bigte account is now active.</p>
                
                <p>You can now access all the features and services available in our platform. We're excited to have you as part of our community!</p>
                
                <div style='text-align: center;'>
                    <a href='#' class='button'>Get Started</a>
                </div>
                
                <p>If you have any questions or need assistance, please don't hesitate to contact our support team.</p>
                
                <div class='footer'>
                    <p>Thank you for choosing RICH Bigte!</p>
                    <p>&copy; " . date('Y') . " RICH Bigte. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>";
    }
}
?>
