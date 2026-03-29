/**
 * UserResponseDto — controls exactly what user data leaves the API.
 *
 * NEVER return raw entity objects from controllers.
 * Entities may contain fields added in the future (sensitive data, internal flags)
 * that would be accidentally exposed. DTOs give explicit control.
 */
export class UserResponseDto {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  created_at: Date;

  constructor(partial: Partial<UserResponseDto>) {
    Object.assign(this, partial);
  }
}
