
Archiving this branch since Perplexica (now Vane) is adding multiuser, and also I've abandoned this fork to work on a similar project of my own: [Queriocity](https://github.com/fwarg/queriocity).

# Perplexica-mu

Fork of [Perplexica](https://github.com/ItzCrazyKns/Perplexica) with prototype modifications for user management.

## Original Project
- **Repository**: [ItzCrazyKns/Perplexica](https://github.com/ItzCrazyKns/Perplexica)
- **Description**: Original Perplexica project: "Perplexica is an AI-powered answering engine. It is an Open source alternative to Perplexity AI". **Use the original project for any use-case except if you want to test my prototype user management.**

## Changes in this fork

### Multi-User Support
This fork adds multi-user support to Perplexica:

**Authentication & Authorization**
- JWT-based authentication with secure httpOnly cookies
- Role-based access control (user/admin roles)
- First registered user automatically becomes admin
- Password complexity requirements (uppercase, lowercase, numbers, special chars)
- Email format validation
- Rate limiting on login/registration (5 attempts per 15 minutes)

**User Data Isolation**
- Chats are associated with user accounts
- Uploaded files are owned by the uploading user
- Per-user settings stored in database (theme, preferences, system instructions)

**Admin Features**
- User management panel (list, delete, change roles)
- Audit logging for authentication events and admin actions

**Security**
- JWT secret required in production (fails to start without it)
- Runtime validation of JWT payloads
- Zod schema validation on settings updates
- Transaction-based registration to prevent race conditions
- Standardized error handling with proper HTTP status codes

### GPU Status Indicator

An optional feature that displays host GPU utilization in the navbar as a traffic-light indicator:
- **Green**: < 10% usage
- **Yellow**: 10–50% usage
- **Red**: > 50% usage

Useful when running local LLM inference (e.g. Ollama) to monitor GPU load without leaving the browser.

**Enabling the feature**
1. Log in as admin
2. Go to Settings > System
3. Select your GPU type: `AMD (sysfs)` or `NVIDIA (nvidia-smi)`

**Docker configuration**

The indicator reads GPU metrics from the host system, so Docker needs access to the relevant interfaces.

<details>
<summary><b>AMD GPU</b></summary>

AMD GPUs expose utilization via sysfs. Add a read-only volume mount to your `docker-compose.yaml`:

```yaml
services:
  perplexica-frontend:
    volumes:
      - /sys/class/drm:/sys/class/drm:ro
```

How it works: reads `/sys/class/drm/card*/device/gpu_busy_percent`, which is provided by the `amdgpu` kernel driver.
</details>

<details>
<summary><b>NVIDIA GPU</b></summary>

NVIDIA GPUs require the [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html) so that `nvidia-smi` is available inside the container.

1. **Install the toolkit** (Ubuntu/Debian):
   ```bash
   curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
     | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
   curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
     | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
     | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
   sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit
   sudo nvidia-ctk runtime configure --runtime=docker
   sudo systemctl restart docker
   ```

2. **Add the GPU resource to `docker-compose.yaml`**:
   ```yaml
   services:
     perplexica-frontend:
       deploy:
         resources:
           reservations:
             devices:
               - driver: nvidia
                 count: 1
                 capabilities: [gpu]
   ```

How it works: runs `nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits` to query current GPU utilization.
</details>

### Configuration

**Required Environment Variables (Production)**
```bash
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET=your-secure-random-secret
```

### Migration from Single-User
If upgrading from an existing Perplexica installation:
1. Existing chats with no userId will be accessible to all users initially
2. Run the legacy data migration to assign orphaned data to an admin
3. See [development.md](development.md) for migration details

### Known Limitations
- No password reset flow (forgot password)
- No MFA/2FA support
- 7-day token expiry without refresh mechanism
- No server-side session revocation (logout clears cookie only)

See [development.md](development.md) for technical details and future enhancement plans.
